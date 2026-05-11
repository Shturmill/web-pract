use yew::prelude::*;
use yew_router::prelude::*;

use crate::app::Route;

#[function_component(Nav)]
pub fn nav() -> Html {
    html! {
        <nav class="nav" aria-label="Основная навигация">
            <Link<Route> classes="nav-link" to={Route::Home}>{ "Главная" }</Link<Route>>
            <Link<Route> classes="nav-link" to={Route::Services}>{ "Цены" }</Link<Route>>
            <Link<Route> classes="nav-link" to={Route::Client}>{ "Клиент" }</Link<Route>>
            <Link<Route> classes="nav-link" to={Route::Master}>{ "Мастер" }</Link<Route>>
            <Link<Route> classes="nav-link" to={Route::About}>{ "О проекте" }</Link<Route>>
        </nav>
    }
}
