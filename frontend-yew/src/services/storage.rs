use gloo_storage::{LocalStorage, Storage};
use serde::{de::DeserializeOwned, Serialize};

pub fn get_value<T: DeserializeOwned>(key: &str) -> Option<T> {
    LocalStorage::get(key).ok()
}

pub fn set_value<T: Serialize>(key: &str, value: &T) {
    let _ = LocalStorage::set(key, value);
}

pub fn remove_value(key: &str) {
    LocalStorage::delete(key);
}
