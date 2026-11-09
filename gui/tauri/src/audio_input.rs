//! macOS audio inputs via CoreAudio: list them and switch the system default input.
//! The webview's built-in speech always records from the default input, so this is
//! how the dictation mic picker reaches every engine.

use serde::Serialize;
use std::ffi::c_void;

#[derive(Serialize, Debug)]
pub struct AudioInput {
    pub uid: String,
    pub name: String,
    #[serde(rename = "isDefault")]
    pub is_default: bool,
}

#[repr(C)]
struct Address {
    selector: u32,
    scope: u32,
    element: u32,
}

const fn fourcc(s: &[u8; 4]) -> u32 {
    u32::from_be_bytes(*s)
}
const SYSTEM_OBJECT: u32 = 1;
const DEVICES: u32 = fourcc(b"dev#");
const DEFAULT_INPUT: u32 = fourcc(b"dIn ");
const STREAMS: u32 = fourcc(b"stm#");
const NAME: u32 = fourcc(b"lnam");
const UID: u32 = fourcc(b"uid ");
const SCOPE_GLOBAL: u32 = fourcc(b"glob");
const SCOPE_INPUT: u32 = fourcc(b"inpt");
const UTF8: u32 = 0x0800_0100;

#[link(name = "CoreAudio", kind = "framework")]
extern "C" {
    fn AudioObjectGetPropertyDataSize(obj: u32, a: *const Address, qs: u32, q: *const c_void, size: *mut u32) -> i32;
    fn AudioObjectGetPropertyData(obj: u32, a: *const Address, qs: u32, q: *const c_void, size: *mut u32, out: *mut c_void) -> i32;
    fn AudioObjectSetPropertyData(obj: u32, a: *const Address, qs: u32, q: *const c_void, size: u32, data: *const c_void) -> i32;
}
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFStringGetCString(s: *const c_void, buf: *mut u8, len: isize, enc: u32) -> u8;
    fn CFRelease(obj: *const c_void);
}

fn addr(selector: u32, scope: u32) -> Address {
    Address { selector, scope, element: 0 }
}

fn size_of_prop(obj: u32, a: &Address) -> Option<u32> {
    let mut size = 0;
    (unsafe { AudioObjectGetPropertyDataSize(obj, a, 0, std::ptr::null(), &mut size) } == 0).then_some(size)
}

fn u32_prop(obj: u32, a: &Address) -> Option<u32> {
    let mut v = 0u32;
    let mut size = 4;
    (unsafe { AudioObjectGetPropertyData(obj, a, 0, std::ptr::null(), &mut size, &mut v as *mut u32 as *mut c_void) } == 0)
        .then_some(v)
}

fn string_prop(obj: u32, selector: u32) -> Option<String> {
    let mut cf: *const c_void = std::ptr::null();
    let mut size = std::mem::size_of::<*const c_void>() as u32;
    let a = addr(selector, SCOPE_GLOBAL);
    let ok = unsafe { AudioObjectGetPropertyData(obj, &a, 0, std::ptr::null(), &mut size, &mut cf as *mut _ as *mut c_void) };
    if ok != 0 || cf.is_null() {
        return None;
    }
    let mut buf = [0u8; 512];
    let got = unsafe { CFStringGetCString(cf, buf.as_mut_ptr(), buf.len() as isize, UTF8) };
    unsafe { CFRelease(cf) };
    if got == 0 {
        return None;
    }
    let end = buf.iter().position(|&b| b == 0).unwrap_or(buf.len());
    Some(String::from_utf8_lossy(&buf[..end]).into_owned())
}

fn device_ids() -> Vec<u32> {
    let a = addr(DEVICES, SCOPE_GLOBAL);
    let Some(size) = size_of_prop(SYSTEM_OBJECT, &a) else { return vec![] };
    let mut ids = vec![0u32; size as usize / 4];
    let mut size = size;
    let ok = unsafe { AudioObjectGetPropertyData(SYSTEM_OBJECT, &a, 0, std::ptr::null(), &mut size, ids.as_mut_ptr() as *mut c_void) };
    if ok != 0 {
        return vec![];
    }
    ids.truncate(size as usize / 4);
    ids
}

/// Devices that can record (have input streams), including virtual ones like loopback drivers.
fn inputs() -> Vec<(u32, AudioInput)> {
    let default = u32_prop(SYSTEM_OBJECT, &addr(DEFAULT_INPUT, SCOPE_GLOBAL));
    device_ids()
        .into_iter()
        .filter(|&id| size_of_prop(id, &addr(STREAMS, SCOPE_INPUT)).is_some_and(|s| s > 0))
        .filter_map(|id| {
            let uid = string_prop(id, UID)?;
            let name = string_prop(id, NAME).unwrap_or_else(|| uid.clone());
            Some((id, AudioInput { uid, name, is_default: Some(id) == default }))
        })
        .collect()
}

#[tauri::command]
pub fn audio_inputs() -> Vec<AudioInput> {
    inputs().into_iter().map(|(_, d)| d).collect()
}

#[tauri::command]
pub fn set_audio_input(uid: String) -> Result<(), String> {
    let (id, _) = inputs().into_iter().find(|(_, d)| d.uid == uid).ok_or("That input isn't connected.")?;
    let a = addr(DEFAULT_INPUT, SCOPE_GLOBAL);
    let status = unsafe { AudioObjectSetPropertyData(SYSTEM_OBJECT, &a, 0, std::ptr::null(), 4, &id as *const u32 as *const c_void) };
    if status == 0 { Ok(()) } else { Err(format!("macOS refused the input switch ({status}).")) }
}

#[cfg(test)]
mod tests {
    #[test]
    fn unknown_input_is_refused() {
        assert!(super::set_audio_input("not-a-device".into()).is_err());
    }
}
