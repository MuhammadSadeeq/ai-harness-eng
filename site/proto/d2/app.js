// Entry point for every D2 page. Each page wraps its interactive area in one custom element.
import { HomeElement } from "./home.js";
import { mountMotionToggle } from "./common.js";

customElements.define("hx-proto-home", HomeElement);

mountMotionToggle(document.querySelector("[data-motion-slot]"));
