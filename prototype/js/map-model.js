/* The model the map shows is the design workbench's own (design-studio/):
   one building, described once. It is a module, and so are the things it is
   made of, which is why this file and the one it brings with it are loaded
   as modules and the rest of the prototype is not. It runs after them, and
   hands the map the means of making the model (map.js: attach) — the
   workbench's overview, with the map's own two fields laid over it
   (map-fields.js).                                                           */
import { createOverview } from '../../design-studio/overview.js';
import { addFields } from './map-fields.js';

window.Lutie.Map.attach((canvas, options) => addFields(createOverview(canvas, options)));
