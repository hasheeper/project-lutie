/* A choice between a few options.

   One small cell of glass with a lobe for each option, swelling where an
   option sits and narrowing between them (a `lobes…` shape in shapes.js,
   which says where each lobe's centre is, how wide an option may be, and how
   far to the left of its text the bead rests). The options are print. A bead
   of air rests in the chosen lobe, and squeezes through the waist to reach
   another.

   The system sheet uses it for its two-way choices and the map for its three
   views; the look is in modes.css.                                            */
(function (L) {
  'use strict';

  /**
   * @param {string} shapeName  a lobed shape in L.Shapes
   * @param {string} label      what is being chosen, for assistive technology
   * @param {string[]} options  one per lobe
   * @param {number} value      index of the option chosen to begin with
   * @param {(i: number) => void} [onChange]
   * @returns {{ el: HTMLElement, value: number, set: (i: number, quiet?: boolean) => void }}
   */
  function build(shapeName, label, options, value, onChange) {
    const shape = L.Shapes[shapeName];
    const el = document.createElement('div');
    el.className = 'lobes glass';
    el.dataset.glass = shapeName;
    el.setAttribute('role', 'radiogroup');
    el.setAttribute('aria-label', label);
    el.innerHTML =
      '<i class="lobes__bead"></i>' +
      options
        .map((o, i) => `<button type="button" role="radio" style="left:${shape.lobes[i] - shape.span / 2}px;width:${shape.span}px">${o}</button>`)
        .join('');

    const bead = el.firstChild;
    const buttons = L.$$('button', el);
    const self = { el, value, set };

    /** `quiet` places the bead without the squeeze and without telling anyone. */
    function set(i, quiet) {
      if (self.value === i && !quiet) return;
      self.value = i;
      buttons.forEach((b, n) => b.setAttribute('aria-checked', String(n === i)));
      bead.style.translate = `${shape.lobes[i] - shape.bead}px 0`;
      if (quiet) return;
      bead.classList.remove('is-passing');
      void bead.offsetWidth;
      bead.classList.add('is-passing');
      if (onChange) onChange(i);
    }

    buttons.forEach((b, i) => b.addEventListener('click', () => set(i)));
    set(value, true);
    return self;
  }

  L.Lobes = { build };
})(window.Lutie);
