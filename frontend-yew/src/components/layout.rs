use yew::prelude::*;

use crate::components::nav::Nav;

#[derive(Properties, PartialEq)]
pub struct LayoutProps {
    pub children: Children,
}

#[function_component(Layout)]
pub fn layout(props: &LayoutProps) -> Html {
    html! {
        <>
            <header class="site-header">
                <div class="site-header__inner">
                    <a class="brand" href="/">{ "FixPoint" }</a>
                    <Nav />
                </div>
            </header>

            <main>
                { for props.children.iter() }
            </main>

            <footer class="site-footer">
                { "Сервис ремонта техники" }
            </footer>
        </>
    }
}
