use serde::{Deserialize, Serialize};
use tokio::process::ChildStdin;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ServerStatus {
    Stopped,
    Starting,
    Running,
    Stopping,
}

pub struct ServerManager {
    pub status: ServerStatus,
    pub stdin: Option<ChildStdin>,
    pub pid: Option<u32>,
}

impl ServerManager {
    pub fn new() -> Self {
        Self {
            status: ServerStatus::Stopped,
            stdin: None,
            pid: None,
        }
    }
}
