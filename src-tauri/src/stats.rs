use serde::{Deserialize, Serialize};
use std::path::Path;
use sysinfo::{Disks, Pid, ProcessRefreshKind, ProcessesToUpdate, System};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ServerStats {
    pub cpu_percent: f32,
    pub ram_used_mb: u64,
    pub ram_max_mb: u32,
    pub disk_read_kb_s: f32,
    pub disk_write_kb_s: f32,
    pub disk_used_mb: u64,
    pub disk_total_mb: u64,
    /// 0.0 = unknown / not yet sampled / unsupported server type
    pub tps: f32,
    pub players_online: u32,
    pub players_max: u32,
    pub uptime_seconds: u64,
}

/// Polls one process tree by PID and computes deltas for disk I/O against the previous sample.
/// Also samples free space on the disk that contains the server directory.
pub struct StatsPoller {
    sys: System,
    last_disk_read: u64,
    last_disk_write: u64,
    last_sample: std::time::Instant,
}

impl StatsPoller {
    pub fn new() -> Self {
        Self {
            sys: System::new(),
            last_disk_read: 0,
            last_disk_write: 0,
            last_sample: std::time::Instant::now(),
        }
    }

    /// Sample CPU/RAM/disk-I/O for the process tree rooted at `root_pid`,
    /// plus disk-space usage for the volume containing `server_path`.
    /// Returns (cpu%, ram_mb, disk_read_kb_s, disk_write_kb_s, disk_used_mb, disk_total_mb).
    pub fn sample(&mut self, root_pid: u32, server_path: &Path) -> Option<(f32, u64, f32, f32, u64, u64)> {
        self.sys.refresh_processes_specifics(
            ProcessesToUpdate::All,
            true,
            ProcessRefreshKind::new()
                .with_cpu()
                .with_memory()
                .with_disk_usage(),
        );

        // BFS through processes to find root + descendants
        let mut wanted: std::collections::HashSet<Pid> = std::collections::HashSet::new();
        wanted.insert(Pid::from_u32(root_pid));
        let mut changed = true;
        while changed {
            changed = false;
            for (pid, proc_) in self.sys.processes() {
                if let Some(parent) = proc_.parent() {
                    if wanted.contains(&parent) && !wanted.contains(pid) {
                        wanted.insert(*pid);
                        changed = true;
                    }
                }
            }
        }

        let mut total_cpu = 0.0;
        let mut total_ram: u64 = 0;
        let mut total_disk_read: u64 = 0;
        let mut total_disk_written: u64 = 0;
        let mut found_any = false;

        for pid in &wanted {
            if let Some(proc_) = self.sys.process(*pid) {
                total_cpu += proc_.cpu_usage();
                total_ram += proc_.memory();
                let du = proc_.disk_usage();
                total_disk_read += du.total_read_bytes;
                total_disk_written += du.total_written_bytes;
                found_any = true;
            }
        }
        if !found_any { return None; }

        let now = std::time::Instant::now();
        let elapsed = now.duration_since(self.last_sample).as_secs_f32().max(0.001);
        let read_delta = total_disk_read.saturating_sub(self.last_disk_read);
        let write_delta = total_disk_written.saturating_sub(self.last_disk_write);
        let read_kb_s = (read_delta as f32 / 1024.0) / elapsed;
        let write_kb_s = (write_delta as f32 / 1024.0) / elapsed;

        let first_sample = self.last_disk_read == 0 && self.last_disk_write == 0;
        self.last_disk_read = total_disk_read;
        self.last_disk_write = total_disk_written;
        self.last_sample = now;

        // Disk space: find the volume mount point containing server_path
        let (used_mb, total_mb) = disk_space_for_path(server_path).unwrap_or((0, 0));

        Some((
            total_cpu,
            total_ram / 1024 / 1024,
            if first_sample { 0.0 } else { read_kb_s },
            if first_sample { 0.0 } else { write_kb_s },
            used_mb,
            total_mb,
        ))
    }
}

/// Find the disk volume containing `path` and return (used_mb, total_mb).
fn disk_space_for_path(path: &Path) -> Option<(u64, u64)> {
    let canon = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let disks = Disks::new_with_refreshed_list();
    // Pick the deepest mount point that is a prefix of our canonical path
    let mut best: Option<(u64, u64, usize)> = None;
    for disk in &disks {
        let mp = disk.mount_point();
        if canon.starts_with(mp) {
            let total = disk.total_space();
            let avail = disk.available_space();
            let used = total.saturating_sub(avail);
            let depth = mp.as_os_str().len();
            if best.map(|(_, _, d)| depth > d).unwrap_or(true) {
                best = Some((used / 1024 / 1024, total / 1024 / 1024, depth));
            }
        }
    }
    best.map(|(u, t, _)| (u, t))
}
