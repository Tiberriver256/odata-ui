import { ODataUI } from './mount.js';

// Assign directly so `<script src="odata-ui.standalone.js">` exposes callable `globalThis.ODataUI(...)`
(globalThis as Record<string, unknown>).ODataUI = ODataUI;

export default ODataUI;
