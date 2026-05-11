use wasm_bindgen_futures::spawn_local;
use yew::prelude::*;

use crate::models::{CreateRequestPayload, RepairRequest};
use crate::services::{api, storage};

#[function_component(ClientPage)]
pub fn client_page() -> Html {
    let client_name = use_state(String::new);
    let client_phone = use_state(String::new);
    let device = use_state(String::new);
    let problem = use_state(String::new);
    let service_type = use_state(|| "Диагностика устройства".to_string());
    let price_from = use_state(|| 0_i64);
    let planned_at = use_state(String::new);
    let status = use_state(String::new);
    let requests = use_state(Vec::<RepairRequest>::new);

    {
        let client_name = client_name.clone();
        let client_phone = client_phone.clone();

        use_effect_with((), move |_| {
            if let Some(saved) = storage::get_value::<(String, String)>("client_profile") {
                client_name.set(saved.0);
                client_phone.set(saved.1);
            }

            || ()
        });
    }

    let save_profile = {
        let client_name = client_name.clone();
        let client_phone = client_phone.clone();
        let status = status.clone();

        Callback::from(move |_| {
            storage::set_value(
                "client_profile",
                &((*client_name).clone(), (*client_phone).clone()),
            );

            status.set("Профиль сохранён в браузере.".to_string());
        })
    };

    let submit_request = {
        let client_name = client_name.clone();
        let client_phone = client_phone.clone();
        let device = device.clone();
        let problem = problem.clone();
        let service_type = service_type.clone();
        let price_from = price_from.clone();
        let planned_at = planned_at.clone();
        let status = status.clone();
        let requests = requests.clone();

        Callback::from(move |_| {
            let payload = CreateRequestPayload {
                client_name: (*client_name).clone(),
                client_phone: (*client_phone).clone(),
                device: (*device).clone(),
                problem: (*problem).clone(),
                service_type: (*service_type).clone(),
                price_from: *price_from,
                planned_at: (*planned_at).clone(),
            };

            let status = status.clone();
            let requests = requests.clone();
            let phone = (*client_phone).clone();

            spawn_local(async move {
                match api::create_request(&payload).await {
                    Ok(_) => {
                        status.set("Заявка отправлена.".to_string());

                        if let Ok(list) = api::get_client_requests(&phone).await {
                            requests.set(list);
                        }
                    }
                    Err(err) => status.set(format!("Ошибка: {err}")),
                }
            });
        })
    };

    html! {
        <section class="page-section">
            <p class="eyebrow">{ "Профиль клиента" }</p>
            <h1>{ "Заявка на ремонт" }</h1>

            <article class="card">
                <label>{ "Имя" }</label>
                <input
                    value={(*client_name).clone()}
                    oninput={{
                        let client_name = client_name.clone();
                        Callback::from(move |e: InputEvent| {
                            let input: web_sys::HtmlInputElement = e.target_unchecked_into();
                            client_name.set(input.value());
                        })
                    }}
                />

                <label>{ "Телефон" }</label>
                <input
                    r#type="tel"
                    placeholder="+7 900 000-00-00"
                    value={(*client_phone).clone()}
                    oninput={{
                        let client_phone = client_phone.clone();
                        Callback::from(move |e: InputEvent| {
                            let input: web_sys::HtmlInputElement = e.target_unchecked_into();
                            client_phone.set(input.value());
                        })
                    }}
                />

                <button type="button" onclick={save_profile}>{ "Сохранить профиль" }</button>
            </article>

            <article class="card">
                <label>{ "Устройство" }</label>
                <input
                    value={(*device).clone()}
                    oninput={{
                        let device = device.clone();
                        Callback::from(move |e: InputEvent| {
                            let input: web_sys::HtmlInputElement = e.target_unchecked_into();
                            device.set(input.value());
                        })
                    }}
                />

                <label>{ "Тип ремонта" }</label>
                <select
                    onchange={{
                        let service_type = service_type.clone();
                        let price_from = price_from.clone();
                        Callback::from(move |e: Event| {
                            let input: web_sys::HtmlInputElement = e.target_unchecked_into();
                            let value = input.value();

                            let price = match value.as_str() {
                                "Замена дисплея" => 2490,
                                "Замена аккумулятора" => 1490,
                                "Ремонт после воды" => 1990,
                                _ => 0,
                            };

                            service_type.set(value);
                            price_from.set(price);
                        })
                    }}
                >
                    <option value="Диагностика устройства">{ "Диагностика устройства — от 0 ₽" }</option>
                    <option value="Замена дисплея">{ "Замена дисплея — от 2490 ₽" }</option>
                    <option value="Замена аккумулятора">{ "Замена аккумулятора — от 1490 ₽" }</option>
                    <option value="Ремонт после воды">{ "Ремонт после воды — от 1990 ₽" }</option>
                </select>

                <label>{ "Описание проблемы" }</label>
                <textarea
                    value={(*problem).clone()}
                    oninput={{
                        let problem = problem.clone();
                        Callback::from(move |e: InputEvent| {
                            let input: web_sys::HtmlInputElement = e.target_unchecked_into();
                            problem.set(input.value());
                        })
                    }}
                />

                <label>{ "Желаемое время" }</label>
                <input
                    r#type="datetime-local"
                    value={(*planned_at).clone()}
                    oninput={{
                        let planned_at = planned_at.clone();
                        Callback::from(move |e: InputEvent| {
                            let input: web_sys::HtmlInputElement = e.target_unchecked_into();
                            planned_at.set(input.value());
                        })
                    }}
                />

                <button type="button" onclick={submit_request}>{ "Отправить заявку" }</button>
                <p class="form-status">{ (*status).clone() }</p>
            </article>
        </section>
    }
}
