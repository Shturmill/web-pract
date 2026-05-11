mod app;
mod components;
mod models;
mod pages;
mod services;

fn main() {
    yew::Renderer::<app::App>::new().render();
}
