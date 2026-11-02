use std::path::Path;
use std::process::Command;

const RELATIVE_JAR: &str = "server/desktop/build/libs/slimevr.jar";

fn matches_server(command: &str, cwd: &str, root: &Path) -> bool {
    let Some((_, invocation)) = command.trim().split_once(" -jar ") else {
        return false;
    };
    let jar = root.join(RELATIVE_JAR);
    // macOS may report /private/var for a checkout addressed through /var.
    let same_directory = Path::new(cwd) == root
        || Path::new(cwd)
            .canonicalize()
            .ok()
            .zip(root.canonicalize().ok())
            .is_some_and(|(cwd, root)| cwd == root);
    invocation == format!("{} run", jar.display())
        || (invocation == format!("{RELATIVE_JAR} run") && same_directory)
}

fn output(command: &mut Command) -> Result<String, String> {
    let result = command.output().map_err(|e| e.to_string())?;
    if !result.status.success() {
        return Err("Could not inspect server process".into());
    }
    String::from_utf8(result.stdout).map_err(|e| e.to_string())
}

fn is_server(pid: u32, root: &Path) -> Result<bool, String> {
    let command = output(Command::new("ps").args([
        "-ww", "-p", &pid.to_string(), "-o", "command=",
    ]))?;
    // lsof's field output preserves spaces in the checkout path.
    let cwd = output(Command::new("lsof").args(["-a", "-p", &pid.to_string(), "-d", "cwd", "-Fn"]))?;
    let cwd = cwd
        .lines()
        .find_map(|line| line.strip_prefix('n'))
        .ok_or("Missing process working directory")?;
    Ok(matches_server(&command, cwd, root))
}

pub fn stop_server(root: &Path) -> Result<(), String> {
    let candidates = Command::new("pgrep")
        .args(["-x", "java"])
        .output()
        .map_err(|e| e.to_string())?;
    if candidates.status.code() == Some(1) {
        return Ok(());
    }
    if !candidates.status.success() {
        return Err("Could not enumerate Java processes".into());
    }
    let candidates = String::from_utf8(candidates.stdout).map_err(|e| e.to_string())?;
    for line in candidates.lines() {
        let pid: u32 = line.parse().map_err(|_| "Invalid Java process ID")?;
        if !is_server(pid, root)? {
            continue;
        }
        let status = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status()
            .map_err(|e| e.to_string())?;
        if !status.success() {
            return Err(format!("Could not stop server process {pid}"));
        }
        let mut exited = false;
        for _ in 0..50 {
            let status = Command::new("kill")
                .args(["-0", &pid.to_string()])
                .output()
                .map_err(|e| e.to_string())?;
            if !status.status.success() {
                exited = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        if !exited {
            return Err(format!("Server process {pid} did not exit; restart cancelled"));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_matches_this_checkouts_jar() {
        let root = Path::new("/Projects/SlimeVR Server");
        assert!(matches_server("java -Xmx128M -jar /Projects/SlimeVR Server/server/desktop/build/libs/slimevr.jar run", "/elsewhere", root));
        assert!(matches_server("java -Xmx128M -jar server/desktop/build/libs/slimevr.jar run", "/Projects/SlimeVR Server", root));
        assert!(!matches_server("java -jar server/desktop/build/libs/slimevr.jar run", "/Projects/other", root));
        assert!(!matches_server("java -jar /Projects/other/server/desktop/build/libs/slimevr.jar run", "/Projects/SlimeVR Server", root));
        assert!(!matches_server("java -jar /Projects/SlimeVR Server/server/desktop/build/libs/slimevr.jar run-extra", "", root));
        assert!(!matches_server("java -jar slimevr.jar run", "/Projects/SlimeVR Server", root));
    }
}
