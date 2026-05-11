use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ClientProfile {
    pub id: Option<i64>,
    pub name: String,
    pub phone: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct MasterProfile {
    pub id: i64,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct RepairRequest {
    pub id: i64,
    pub client_name: String,
    pub client_phone: String,
    pub device: String,
    pub problem: String,
    pub service_type: String,
    pub price_from: i64,
    pub planned_at: Option<String>,
    pub status: String,
    pub assignee: Option<i64>,
    pub assignee_name: Option<String>,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Message {
    pub id: i64,
    pub request_id: i64,
    pub author_role: String,
    pub author_name: String,
    pub text: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct CreateRequestPayload {
    pub client_name: String,
    pub client_phone: String,
    pub device: String,
    pub problem: String,
    pub service_type: String,
    pub price_from: i64,
    pub planned_at: String,
}
