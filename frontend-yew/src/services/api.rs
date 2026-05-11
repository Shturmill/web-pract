use gloo_net::http::Request;

use crate::models::{CreateRequestPayload, MasterProfile, Message, RepairRequest};

const API: &str = "/api";

pub async fn get_client_requests(phone: &str) -> Result<Vec<RepairRequest>, String> {
    let url = format!("{API}/requests/client/{phone}");

    Request::get(&url)
        .send()
        .await
        .map_err(|err| err.to_string())?
        .json::<Vec<RepairRequest>>()
        .await
        .map_err(|err| err.to_string())
}

pub async fn get_open_requests() -> Result<Vec<RepairRequest>, String> {
    Request::get(&format!("{API}/requests/open"))
        .send()
        .await
        .map_err(|err| err.to_string())?
        .json::<Vec<RepairRequest>>()
        .await
        .map_err(|err| err.to_string())
}

pub async fn get_master_requests(master_id: i64) -> Result<Vec<RepairRequest>, String> {
    Request::get(&format!("{API}/requests/master/{master_id}"))
        .send()
        .await
        .map_err(|err| err.to_string())?
        .json::<Vec<RepairRequest>>()
        .await
        .map_err(|err| err.to_string())
}

pub async fn create_request(payload: &CreateRequestPayload) -> Result<RepairRequest, String> {
    Request::post(&format!("{API}/requests"))
        .json(payload)
        .map_err(|err| err.to_string())?
        .send()
        .await
        .map_err(|err| err.to_string())?
        .json::<RepairRequest>()
        .await
        .map_err(|err| err.to_string())
}

pub async fn take_request(request_id: i64, master_id: i64) -> Result<RepairRequest, String> {
    Request::post(&format!("{API}/requests/{request_id}/take"))
        .json(&serde_json::json!({ "master_id": master_id }))
        .map_err(|err| err.to_string())?
        .send()
        .await
        .map_err(|err| err.to_string())?
        .json::<RepairRequest>()
        .await
        .map_err(|err| err.to_string())
}

pub async fn send_message(
    request_id: i64,
    author_role: &str,
    author_name: &str,
    text: &str,
) -> Result<Message, String> {
    Request::post(&format!("{API}/requests/{request_id}/messages"))
        .json(&serde_json::json!({
            "author_role": author_role,
            "author_name": author_name,
            "text": text
        }))
        .map_err(|err| err.to_string())?
        .send()
        .await
        .map_err(|err| err.to_string())?
        .json::<Message>()
        .await
        .map_err(|err| err.to_string())
}

pub async fn login_master(code: &str) -> Result<MasterProfile, String> {
    Request::post(&format!("{API}/masters/login"))
        .json(&serde_json::json!({ "code": code }))
        .map_err(|err| err.to_string())?
        .send()
        .await
        .map_err(|err| err.to_string())?
        .json::<MasterProfile>()
        .await
        .map_err(|err| err.to_string())
}
