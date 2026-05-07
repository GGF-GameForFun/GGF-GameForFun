use std::path::PathBuf;

/// Map a Minecraft version like "1.20.1" to the Java major version that should run it.
/// Conservative — picks the highest Java the version is well-tested with.
pub fn required_java_for_mc(mc_version: &str) -> u8 {
    // Parse "1.X.Y" → minor = X
    let minor = mc_version
        .strip_prefix("1.")
        .and_then(|rest| rest.split('.').next())
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(20);

    // Minor patch (the .Y part) — needed to distinguish 1.20.4 from 1.20.5+
    let patch = mc_version
        .strip_prefix("1.")
        .and_then(|rest| rest.split('.').nth(1))
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0);

    match minor {
        0..=16 => 8,
        17 => 16,
        18 | 19 => 17,
        20 if patch <= 4 => 17,
        20 => 21,        // 1.20.5+
        _ => 21,         // 1.21.x and beyond
    }
}

/// Find an installed JDK matching the requested major version.
/// Searches /Library/Java/JavaVirtualMachines on macOS, common Windows install dirs,
/// JAVA_HOME and PATH.
pub fn find_java_with_version(major: u8) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = vec![];

    #[cfg(target_os = "macos")]
    {
        if let Ok(entries) = std::fs::read_dir("/Library/Java/JavaVirtualMachines") {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().to_string();
                // e.g. "temurin-17.jdk", "jdk-17.0.10.jdk", "zulu-17.jdk"
                if name.contains(&format!("-{}.", major))
                    || name.contains(&format!("-{}-", major))
                    || name.contains(&format!("-{}.jdk", major))
                {
                    let bin = entry.path().join("Contents/Home/bin/java");
                    if bin.exists() { candidates.push(bin); }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(pf) = std::env::var("PROGRAMFILES") {
            for vendor in &["Eclipse Adoptium", "Java", "Microsoft", "Amazon Corretto"] {
                if let Ok(entries) = std::fs::read_dir(format!("{}\\{}", pf, vendor)) {
                    for entry in entries.flatten() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if name.contains(&format!("-{}.", major))
                            || name.contains(&format!("-{}-", major))
                            || name.starts_with(&format!("jdk-{}", major))
                            || name.starts_with(&format!("jdk{}", major))
                        {
                            let bin = entry.path().join("bin\\java.exe");
                            if bin.exists() { candidates.push(bin); }
                        }
                    }
                }
            }
        }
    }

    // Bundled (downloaded) JRE in our app data folder
    let bundled = bundled_java_dir(major);
    #[cfg(target_os = "macos")]
    let bundled_bin = bundled.join("Contents/Home/bin/java");
    #[cfg(target_os = "windows")]
    let bundled_bin = bundled.join("bin\\java.exe");
    #[cfg(target_os = "linux")]
    let bundled_bin = bundled.join("bin/java");
    if bundled_bin.exists() { candidates.push(bundled_bin); }

    // Verify version of each candidate
    for path in candidates {
        if let Ok(out) = std::process::Command::new(&path).arg("-version").output() {
            let stderr = String::from_utf8_lossy(&out.stderr);
            // Java prints version like: openjdk version "17.0.10" 2024-01-16
            //                       or: java version "17.0.5" 2022-10-18
            for line in stderr.lines().chain(String::from_utf8_lossy(&out.stdout).lines()) {
                if line.contains("version") {
                    if let Some(start) = line.find('"') {
                        let rest = &line[start + 1..];
                        if let Some(end) = rest.find('"') {
                            let ver = &rest[..end];
                            // Java 8: "1.8.0_xxx", Java 9+: "9.x.y", "17.x.y", etc.
                            let major_parsed: Option<u8> = if ver.starts_with("1.") {
                                ver.split('.').nth(1).and_then(|s| s.parse().ok())
                            } else {
                                ver.split('.').next().and_then(|s| s.parse().ok())
                            };
                            if major_parsed == Some(major) {
                                return Some(path);
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

/// Returns JAVA_HOME for a java binary path (the dir containing bin/java).
pub fn java_home_from_bin(bin: &std::path::Path) -> Option<PathBuf> {
    bin.parent().and_then(|p| p.parent()).map(|p| p.to_path_buf())
}

pub fn bundled_java_dir(major: u8) -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("mchost")
        .join("java")
        .join(format!("temurin-{}", major))
}

/// Download URL for an Eclipse Temurin JRE matching this OS/arch and major Java version.
pub fn temurin_download_url(major: u8) -> String {
    #[cfg(target_os = "macos")]
    let (os, arch) = ("mac", if cfg!(target_arch = "aarch64") { "aarch64" } else { "x64" });
    #[cfg(target_os = "windows")]
    let (os, arch) = ("windows", "x64");
    #[cfg(target_os = "linux")]
    let (os, arch) = ("linux", if cfg!(target_arch = "aarch64") { "aarch64" } else { "x64" });

    format!(
        "https://api.adoptium.net/v3/binary/latest/{}/ga/{}/{}/jre/hotspot/normal/eclipse",
        major, os, arch
    )
}
