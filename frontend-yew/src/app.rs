use yew::prelude::*;
use yew_router::prelude::*;

use crate::components::layout::Layout;
use crate::pages::{
    about::AboutPage, client::ClientPage, home::HomePage, master::MasterPage,
    services::ServicesPage,
};

#[derive(Clone, Routable, PartialEq)]
pub enum Route {
    #[at("/")]
    Home,

    #[at("/services")]
    Services,

    #[at("/client")]
    Client,

    #[at("/master")]
    Master,

    #[at("/about")]
    About,

    #[not_found]
    #[at("/404")]
    NotFound,
}

fn switch(route: Route) -> Html {
    match route {
        Route::Home => html! { <HomePage /> },
        Route::Services => html! { <ServicesPage /> },
        Route::Client => html! { <ClientPage /> },
        Route::Master => html! { <MasterPage /> },
        Route::About => html! { <AboutPage /> },
        Route::NotFound => html! { <HomePage /> },
    }
}

#[function_component(App)]
pub fn app() -> Html {
    html! {
        <BrowserRouter>
            <Layout>
                <Switch<Route> render={switch} />
            </Layout>
        </BrowserRouter>
    }
}
