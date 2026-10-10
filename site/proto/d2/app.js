// Entry point for every D2 page. Each page wraps its interactive area in one custom element.
import { HomeElement } from "./home.js";
import { BreakElement } from "./break.js";
import { ProveElement } from "./prove.js";
import { mountMotionToggle } from "./common.js";

customElements.define("hx-proto-home", HomeElement);
customElements.define("hx-proto-break", BreakElement);
customElements.define("hx-proto-prove", ProveElement);

mountMotionToggle(document.querySelector("[data-motion-slot]"));
