//! A film's own dynamic HDR metadata — Dolby Vision's RPU and HDR10+ — read at a few points across it.
//!
//! The probe (`probe.rs`) learns from ffprobe *that* a file is Dolby Vision
//! or HDR10+. What the metadata says — how bright the film's frames are,
//! the mastering figures Dolby Vision keeps in its own L6, whether the
//! grader left trims for smaller screens (L2, L8) — sits in every frame, so
//! it is read here, from the file, for the details panel.
//!
//! **One ffmpeg run per file, only for Dolby Vision or HDR10+ files.** It
//! seeks to [`POINTS`] places spread over the film and copies one frame's
//! metadata from each — no decoding: `filter_units` keeps only NAL type 62
//! (the Dolby Vision RPU) and 39 (the SEI that carries HDR10+), a few hundred
//! bytes a frame. About a second on a 4K film; nothing for any other file.
//! Each point goes to its own small file in a temporary folder, removed
//! after: ffmpeg cannot write several outputs to one pipe safely.
//!
//! The RPU is read by the `dolby_vision` crate (quietvoid's, MIT, the library
//! inside dovi_tool); HDR10+ (SMPTE ST 2094-40) is a short bit layout, read
//! here. Brightness from a sample is what it is: the brightest and the
//! average of the frames read, and the panel says how many there were.
//! Anything unreadable is left out, never guessed.

use dolby_vision::rpu::dovi_rpu::DoviRpu;
use dolby_vision::rpu::extension_metadata::blocks::ExtMetadataBlock;
use dolby_vision::rpu::rpu_data_nlq::DoviELType;
use dolby_vision::utils::{clear_start_code_emulation_prevention_3_byte, pq_to_nits};
use crate::probe::EnhancementLayer;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU32, Ordering};

/// How many places in the film are read. Measured on a 4K remux on a network
/// share (R12-B2, 2026-11-22): 8 points ≈ 1.1 s, 16 ≈ 2.2 s — the open and
/// seek cost, not the bytes.
pub const POINTS: usize = 10;

/// How bright the frames read were, in nits.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Brightness {
    /// The brightest frame's brightest pixel.
    pub peak_nits: f64,
    /// The average over the frames of each frame's own average.
    pub average_nits: f64,
    /// Frames that carried the metadata, one per point.
    pub frames: u32,
}

/// What the Dolby Vision RPU says, read by the `dolby_vision` crate.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct DvMetadata {
    /// The profile the RPU itself implies (5, 7, 8…).
    pub profile: Option<u8>,
    /// FEL or MEL, for a file with an enhancement layer.
    pub enhancement_layer: Option<EnhancementLayer>,
    /// The content-mapping version the grade was made for: `2.9` or `4.0`.
    pub cm_version: Option<String>,
    /// From each frame's L1: its darkest, brightest and average.
    pub brightness: Option<Brightness>,
    /// L6, the grade's own static figures; `None` where the file leaves them 0.
    pub mastering_peak_nits: Option<u16>,
    pub max_cll: Option<u16>,
    pub max_fall: Option<u16>,
    /// Trims for other screens: L2 (2.9 and 4.0), L8 (4.0 only).
    pub l2_trims: bool,
    pub l8_trims: bool,
    /// Places read across the film, and how many of their frames had an
    /// RPU. Found on a real file: a profile 8 configuration record and no
    /// RPU anywhere — every other field is then empty.
    pub points: u32,
    #[serde(default)]
    pub rpus: Option<u32>,
}

/// What HDR10+ (SMPTE ST 2094-40) says.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Hdr10PlusMetadata {
    /// From each frame's MaxSCL (brightest) and average MaxRGB.
    pub brightness: Option<Brightness>,
    /// The display the metadata was made for, in nits.
    pub target_display_nits: Option<u32>,
    /// Places read across the film. Found on a real file: HDR10+ in its
    /// first frames only, none further in — `brightness` is then `None`.
    pub points: u32,
}

/// Running totals over the frames read.
#[derive(Default)]
pub(crate) struct Reading {
    /// Points whose frame came back.
    points: u32,
    dv_profile: Option<u8>,
    dv_el: Option<EnhancementLayer>,
    cm_v40: bool,
    rpus: u32,
    l1: Totals,
    l6: Option<(u16, u16, u16)>,
    l2: bool,
    l8: bool,
    hdr10p_target: Option<u32>,
    hdr10p: Totals,
}

#[derive(Default)]
struct Totals {
    peak: f64,
    average_sum: f64,
    frames: u32,
}

impl Totals {
    fn add(&mut self, peak: f64, average: f64) {
        self.peak = self.peak.max(peak);
        self.average_sum += average;
        self.frames += 1;
    }

    fn brightness(&self) -> Option<Brightness> {
        (self.frames > 0).then(|| Brightness {
            peak_nits: round1(self.peak),
            average_nits: round1(self.average_sum / f64::from(self.frames)),
            frames: self.frames,
        })
    }
}

fn round1(v: f64) -> f64 {
    (v * 10.0).round() / 10.0
}

/// A 12-bit PQ code, as L1 keeps it, in nits.
fn pq12_nits(code: u16) -> f64 {
    pq_to_nits(f64::from(code) / 4095.0)
}

impl Reading {
    /// Read one point's frame: every NAL in an Annex B stream, RPUs (62)
    /// and SEIs (39).
    pub(crate) fn add_annexb(&mut self, data: &[u8]) {
        if data.is_empty() {
            return;
        }
        self.points += 1;
        for nal in nal_units(data) {
            match nal.first().map(|b| (b >> 1) & 0x3f) {
                Some(62) => self.add_rpu(nal),
                Some(39) => self.add_sei(nal),
                _ => {}
            }
        }
    }

    fn add_rpu(&mut self, nal: &[u8]) {
        let Ok(rpu) = DoviRpu::parse_unspec62_nalu(nal) else {
            return;
        };
        self.rpus += 1;
        self.dv_profile = self.dv_profile.or(Some(rpu.dovi_profile));
        // Any frame with a full layer makes the film's layer full.
        match rpu.el_type {
            Some(DoviELType::FEL) => self.dv_el = Some(EnhancementLayer::Full),
            Some(DoviELType::MEL) if self.dv_el.is_none() => {
                self.dv_el = Some(EnhancementLayer::Minimal)
            }
            _ => {}
        }
        let Some(dm) = rpu.vdr_dm_data.as_ref() else {
            return;
        };
        self.cm_v40 |= dm.cmv40_metadata.is_some();
        for block in dm.level_blocks_iter(1) {
            if let ExtMetadataBlock::Level1(l1) = block {
                self.l1.add(pq12_nits(l1.max_pq), pq12_nits(l1.avg_pq));
            }
        }
        if self.l6.is_none() {
            if let Some(ExtMetadataBlock::Level6(l6)) = dm.get_block(6) {
                self.l6 = Some((
                    l6.max_display_mastering_luminance,
                    l6.max_content_light_level,
                    l6.max_frame_average_light_level,
                ));
            }
        }
        self.l2 |= dm.level_blocks_iter(2).next().is_some();
        self.l8 |= dm.level_blocks_iter(8).next().is_some();
    }

    fn add_sei(&mut self, nal: &[u8]) {
        let rbsp = clear_start_code_emulation_prevention_3_byte(nal.get(2..).unwrap_or(&[]));
        let mut at = 0;
        // sei_message()s until the trailing bits.
        while at + 2 <= rbsp.len() && rbsp[at] != 0x80 {
            let Some((kind, next)) = ff_coded(&rbsp, at) else { return };
            let Some((size, next)) = ff_coded(&rbsp, next) else { return };
            let Some(payload) = rbsp.get(next..next + size) else { return };
            if kind == 4 {
                if let Some((target, peak, average)) = hdr10_plus(payload) {
                    self.hdr10p_target = self.hdr10p_target.or(Some(target));
                    self.hdr10p.add(peak, average);
                }
            }
            at = next + size;
        }
    }

    /// What the RPUs said; `None` when no frame was read at all. Asked only
    /// of a file ffprobe found Dolby Vision in.
    pub(crate) fn dolby_vision(&self) -> Option<DvMetadata> {
        if self.points == 0 {
            return None;
        }
        let nonzero = |v: u16| (v > 0).then_some(v);
        Some(DvMetadata {
            profile: self.dv_profile,
            enhancement_layer: self.dv_el,
            cm_version: (self.rpus > 0)
                .then(|| if self.cm_v40 { "4.0" } else { "2.9" }.to_string()),
            brightness: self.l1.brightness(),
            mastering_peak_nits: self.l6.and_then(|l| nonzero(l.0)),
            max_cll: self.l6.and_then(|l| nonzero(l.1)),
            max_fall: self.l6.and_then(|l| nonzero(l.2)),
            l2_trims: self.l2,
            l8_trims: self.l8,
            points: self.points,
            rpus: Some(self.rpus),
        })
    }

    /// What HDR10+ said; `None` when no frame was read at all. Asked only
    /// of a file ffprobe found HDR10+ in, or that had some here.
    pub(crate) fn hdr10_plus(&self) -> Option<Hdr10PlusMetadata> {
        (self.points > 0).then(|| Hdr10PlusMetadata {
            brightness: self.hdr10p.brightness(),
            target_display_nits: self.hdr10p_target.filter(|t| *t > 0),
            points: self.points,
        })
    }

    pub(crate) fn has_hdr10_plus(&self) -> bool {
        self.hdr10p.frames > 0
    }
}

/// The NAL units of an Annex B stream, start codes removed.
fn nal_units(data: &[u8]) -> impl Iterator<Item = &[u8]> {
    let mut starts = Vec::new();
    let mut i = 0;
    while i + 3 <= data.len() {
        if data[i] == 0 && data[i + 1] == 0 && data[i + 2] == 1 {
            starts.push(i + 3);
            i += 3;
        } else {
            i += 1;
        }
    }
    let ends: Vec<usize> = starts
        .iter()
        .skip(1)
        .map(|s| s - 3)
        .chain(std::iter::once(data.len()))
        .collect();
    starts.into_iter().zip(ends).map(move |(s, e)| {
        // A four-byte start code leaves its leading zero on the unit before.
        let mut end = e;
        while end > s && data[end - 1] == 0 {
            end -= 1;
        }
        &data[s..end]
    })
}

/// An SEI payload type or size: 0xFF bytes add 255 each, the last adds itself.
fn ff_coded(data: &[u8], mut at: usize) -> Option<(usize, usize)> {
    let mut value = 0usize;
    loop {
        let byte = *data.get(at)?;
        at += 1;
        value += usize::from(byte);
        if byte != 0xff {
            return Some((value, at));
        }
    }
}

struct Bits<'a> {
    data: &'a [u8],
    at: usize,
}

impl Bits<'_> {
    fn read(&mut self, n: usize) -> Option<u32> {
        let mut value = 0u32;
        for _ in 0..n {
            let byte = *self.data.get(self.at / 8)?;
            value = (value << 1) | u32::from((byte >> (7 - self.at % 8)) & 1);
            self.at += 1;
        }
        Some(value)
    }

    fn skip(&mut self, n: usize) -> Option<()> {
        self.at += n;
        (self.at <= self.data.len() * 8).then_some(())
    }
}

/// An HDR10+ user-data payload: the target display's peak, and the whole
/// picture's brightest MaxSCL and average MaxRGB, in nits. `None` for any
/// other registered user data. The layout is SMPTE ST 2094-40 as CTA-861
/// carries it (and FFmpeg reads it, `hdr_dynamic_metadata.c`).
fn hdr10_plus(payload: &[u8]) -> Option<(u32, f64, f64)> {
    // ITU-T T.35: United States, Samsung, oriented code 1, application 4.
    if payload.get(..6)? != [0xb5, 0x00, 0x3c, 0x00, 0x01, 0x04] {
        return None;
    }
    let mut bits = Bits { data: &payload[6..], at: 0 };
    bits.read(8)?; // application_version
    let windows = bits.read(2)?;
    if windows == 0 {
        return None;
    }
    // Windows after the first: position and ellipse, 153 bits each.
    bits.skip(153 * (windows as usize - 1))?;
    let target = bits.read(27)?;
    if bits.read(1)? == 1 {
        let rows = bits.read(5)? as usize;
        let cols = bits.read(5)? as usize;
        bits.skip(rows * cols * 4)?;
    }
    // The first window is the whole picture. MaxSCL and average MaxRGB are
    // in units of 1/100000 of 10000 nits: a tenth of a nit.
    let maxscl = [bits.read(17)?, bits.read(17)?, bits.read(17)?];
    let average = bits.read(17)?;
    let peak = maxscl.into_iter().max()?;
    Some((target, f64::from(peak) / 10.0, f64::from(average) / 10.0))
}

static RUN: AtomicU32 = AtomicU32::new(0);

/// Read [`POINTS`] frames' metadata from across the video. `None` when ffmpeg
/// could not, which leaves the panel saying nothing rather than something
/// wrong.
pub fn sample(
    ffmpeg: &Path,
    video: &Path,
    stream_index: u32,
    duration_secs: Option<f64>,
) -> Option<Reading> {
    let dir = std::env::temp_dir().join(format!(
        "skrin-hdr-{}-{}",
        std::process::id(),
        RUN.fetch_add(1, Ordering::Relaxed)
    ));
    std::fs::create_dir_all(&dir).ok()?;
    let result = run_ffmpeg(ffmpeg, video, stream_index, duration_secs, &dir);
    if let Err(e) = std::fs::remove_dir_all(&dir) {
        crate::log!("probe: could not remove {}: {e}", dir.display());
    }
    result
}

fn run_ffmpeg(
    ffmpeg: &Path,
    video: &Path,
    stream_index: u32,
    duration_secs: Option<f64>,
    dir: &Path,
) -> Option<Reading> {
    // Points in the middle of equal slices; one, at the start, if the
    // length is not known.
    let points: Vec<Option<f64>> = match duration_secs.filter(|d| *d > 60.0) {
        Some(d) => (0..POINTS)
            .map(|i| Some(d * (2 * i + 1) as f64 / (2 * POINTS) as f64))
            .collect(),
        None => vec![None],
    };
    let outputs: Vec<PathBuf> = (0..points.len())
        .map(|i| dir.join(format!("{i}.hevc")))
        .collect();

    let mut command = Command::new(ffmpeg);
    command.args(["-v", "fatal", "-nostdin", "-y"]);
    for point in &points {
        if let Some(at) = point {
            command.arg("-ss").arg(format!("{at:.1}"));
        }
        command.arg("-i").arg(video);
    }
    for (i, out) in outputs.iter().enumerate() {
        command
            .arg("-map")
            .arg(format!("{i}:{stream_index}"))
            .args(["-c:v", "copy", "-bsf:v"])
            .arg("hevc_mp4toannexb,filter_units=pass_types=39|62")
            .args(["-frames:v", "1", "-f", "hevc"])
            .arg(out);
    }
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    crate::ffmpeg::no_window(&mut command);
    // A point near the end may fail on its own; whatever was written counts.
    command.status().ok()?;

    let mut reading = Reading::default();
    for out in outputs {
        if let Ok(data) = std::fs::read(&out) {
            reading.add_annexb(&data);
        }
    }
    Some(reading)
}

#[cfg(test)]
mod tests {
    use super::*;
    use dolby_vision::rpu::extension_metadata::blocks::{
        ExtMetadataBlockLevel1, ExtMetadataBlockLevel2, ExtMetadataBlockLevel6,
        ExtMetadataBlockLevel8,
    };
    use dolby_vision::rpu::generate::{GenerateConfig, GenerateProfile};
    use dolby_vision::rpu::vdr_dm_data::CmVersion;

    /// A generated RPU — no film's data — with the given L1 and extras, as
    /// an Annex B NAL.
    fn rpu(profile: GenerateProfile, cm: CmVersion, l1: (u16, u16, u16), extras: bool) -> Vec<u8> {
        let five = matches!(profile, GenerateProfile::Profile5);
        let config = GenerateConfig { profile, cm_version: cm, ..Default::default() };
        let mut rpu = match five {
            true => DoviRpu::profile5_config(&config),
            _ => DoviRpu::profile81_config(&config),
        }
        .unwrap();
        let dm = rpu.vdr_dm_data.as_mut().unwrap();
        dm.replace_metadata_block(ExtMetadataBlock::Level1(ExtMetadataBlockLevel1::new(
            l1.0, l1.1, l1.2,
        )))
        .unwrap();
        if extras {
            dm.add_metadata_block(ExtMetadataBlock::Level2(ExtMetadataBlockLevel2::from_nits(
                600,
            )))
            .unwrap();
            dm.replace_metadata_block(ExtMetadataBlock::Level6(ExtMetadataBlockLevel6 {
                max_display_mastering_luminance: 1000,
                min_display_mastering_luminance: 1,
                max_content_light_level: 950,
                max_frame_average_light_level: 300,
            }))
            .unwrap();
            if cm == CmVersion::V40 {
                dm.add_metadata_block(ExtMetadataBlock::Level8(ExtMetadataBlockLevel8::default()))
                    .unwrap();
            }
        }
        let mut out = vec![0, 0, 0, 1];
        out.extend(rpu.write_hevc_unspec62_nalu().unwrap());
        out
    }

    #[test]
    fn a_profile_8_rpu_gives_its_brightness_mastering_and_trims() {
        let mut r = Reading::default();
        // 12-bit PQ 2081 ≈ 100 nits, 3079 ≈ 1000 nits.
        r.add_annexb(&rpu(GenerateProfile::Profile81, CmVersion::V40, (0, 3079, 2081), true));
        r.add_annexb(&rpu(GenerateProfile::Profile81, CmVersion::V40, (0, 2081, 1229), true));
        let dv = r.dolby_vision().unwrap();
        assert_eq!(dv.profile, Some(8));
        assert_eq!(dv.enhancement_layer, None);
        assert_eq!(dv.cm_version.as_deref(), Some("4.0"));
        let b = dv.brightness.unwrap();
        assert_eq!(b.frames, 2);
        assert!((b.peak_nits - 1000.0).abs() < 15.0, "{}", b.peak_nits);
        assert_eq!(dv.mastering_peak_nits, Some(1000));
        assert_eq!(dv.max_cll, Some(950));
        assert_eq!(dv.max_fall, Some(300));
        assert!(dv.l2_trims && dv.l8_trims);
    }

    #[test]
    fn a_profile_5_rpu_without_trims_says_none() {
        let mut r = Reading::default();
        r.add_annexb(&rpu(GenerateProfile::Profile5, CmVersion::V29, (0, 2500, 1500), false));
        let dv = r.dolby_vision().unwrap();
        assert_eq!(dv.profile, Some(5));
        assert_eq!(dv.cm_version.as_deref(), Some("2.9"));
        assert!(!dv.l2_trims && !dv.l8_trims);
        assert_eq!(dv.max_cll, None, "an L6 of zeros is not a figure");
    }

    #[test]
    fn rubbish_and_other_nals_are_ignored() {
        let mut r = Reading::default();
        r.add_annexb(&[0, 0, 1, 0x7c, 0x01, 0x19, 0x08, 0, 0, 1, 0x40, 0x01, 0xff]);
        let dv = r.dolby_vision().unwrap();
        assert_eq!((dv.rpus, dv.points, dv.cm_version, dv.brightness), (Some(0), 1, None, None));
        assert!(!r.has_hdr10_plus());
        let h = r.hdr10_plus().unwrap();
        assert_eq!((h.brightness, h.points), (None, 1), "read, and none found");
    }

    /// An HDR10+ SEI NAL with one window: target 1000 nits, MaxSCL
    /// (900.0, 1200.5, 400.0) nits, average MaxRGB 85.3 nits.
    fn hdr10_plus_sei() -> Vec<u8> {
        let mut bits: Vec<(u32, usize)> = vec![(1, 8), (1, 2), (1000, 27), (0, 1)];
        bits.extend([(9000, 17), (12005, 17), (4000, 17), (853, 17), (0, 4), (0, 10)]);
        let mut payload = vec![0xb5, 0x00, 0x3c, 0x00, 0x01, 0x04];
        let (mut acc, mut n) = (0u64, 0);
        for (v, w) in bits {
            acc = (acc << w) | u64::from(v);
            n += w;
            while n >= 8 {
                payload.push((acc >> (n - 8)) as u8);
                n -= 8;
            }
        }
        if n > 0 {
            payload.push((acc << (8 - n)) as u8);
        }
        let mut nal = vec![0, 0, 0, 1, 39 << 1, 0x01, 4, payload.len() as u8];
        nal.extend(payload);
        nal.push(0x80);
        nal
    }

    #[test]
    fn hdr10_plus_gives_the_target_and_the_brightest_channel() {
        let mut r = Reading::default();
        r.add_annexb(&hdr10_plus_sei());
        let h = r.hdr10_plus().unwrap();
        assert_eq!(h.target_display_nits, Some(1000));
        let b = h.brightness.unwrap();
        assert_eq!((b.peak_nits, b.average_nits, b.frames), (1200.5, 85.3, 1));
        assert_eq!(r.dolby_vision().unwrap().rpus, Some(0));
    }

    /// What reading one real file costs, the probe's other two runs beside
    /// it: `SKRIN_PROBE_FILE=<film> cargo test probe_cost -- --ignored
    /// --nocapture` (ffmpeg on PATH).
    #[test]
    #[ignore]
    fn probe_cost() {
        let file = PathBuf::from(std::env::var("SKRIN_PROBE_FILE").expect("SKRIN_PROBE_FILE"));
        let ffmpeg = Path::new("ffmpeg");
        let started = std::time::Instant::now();
        let details = crate::probe::probe(ffmpeg, &file).unwrap();
        let whole = started.elapsed();
        let started = std::time::Instant::now();
        let again = sample(ffmpeg, &file, 0, details.duration_secs).unwrap();
        let sampled = started.elapsed();
        let v = details.video.unwrap();
        println!("whole probe {whole:?}, of which sampling ≈ {sampled:?}");
        println!("{:?}
{:?}", v.dolby_vision, v.hdr10_plus_metadata);
        assert_eq!(again.dolby_vision(), v.dolby_vision.and_then(|d| d.metadata));
    }

    /// Real files' metadata, cut by `sample` into a folder outside the
    /// repository (no film data is committed): `SKRIN_HDR_SAMPLES=<dir>
    /// cargo test real_samples -- --ignored --nocapture`. Each `*.hevc` there
    /// is named for what it should read as: `p7-fel-…`, `p7-mel-…`, `p8-…`,
    /// `hdr10plus-…`.
    #[test]
    #[ignore]
    fn real_samples() {
        let dir = std::env::var("SKRIN_HDR_SAMPLES").expect("SKRIN_HDR_SAMPLES");
        let mut checked = 0;
        for entry in std::fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            let name = path.file_name().unwrap().to_string_lossy().to_string();
            if !name.ends_with(".hevc") {
                continue;
            }
            // One file per point, as `sample` writes them, joined: one point.
            let mut r = Reading::default();
            r.add_annexb(&std::fs::read(&path).unwrap());
            println!("{name}: {:?} {:?}", r.dolby_vision(), r.hdr10_plus());
            use EnhancementLayer::{Full, Minimal};
            let dv = r.dolby_vision();
            let el = dv.as_ref().and_then(|d| d.enhancement_layer);
            let profile = dv.as_ref().and_then(|d| d.profile);
            match name.split('-').take(2).collect::<Vec<_>>().as_slice() {
                ["p7", "fel"] => assert_eq!((profile, el), (Some(7), Some(Full)), "{name}"),
                ["p7", "mel"] => assert_eq!((profile, el), (Some(7), Some(Minimal)), "{name}"),
                ["p8", ..] => assert_eq!((profile, el), (Some(8), None), "{name}"),
                ["hdr10plus", ..] => assert!(r.has_hdr10_plus(), "{name}"),
                _ => continue,
            }
            if name.starts_with('p') {
                assert!(dv.unwrap().brightness.is_some(), "{name}: no L1");
            }
            checked += 1;
        }
        assert!(checked > 0, "no samples found");
    }
}
