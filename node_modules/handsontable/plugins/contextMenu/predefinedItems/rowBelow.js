"use strict";

exports.__esModule = true;
exports.default = rowBelowItem;
var C = _interopRequireWildcard(require("../../../i18n/constants"));
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
const KEY = exports.KEY = 'row_below';

/**
 * @returns {object}
 */
function rowBelowItem() {
  return {
    key: KEY,
    name() {
      return this.getTranslatedPhrase(C.CONTEXTMENU_ITEMS_ROW_BELOW);
    },
    callback() {
      const latestSelection = this.getSelectedRangeLast().getBottomRightCorner();
      this.alter('insert_row_below', latestSelection.row, 1, 'ContextMenu.rowBelow');
    },
    disabled() {
      const range = this.getSelectedRangeLast();
      if (!range || this.selection.isSelectedByColumnHeader() || range.isSingleHeader() && range.highlight.row < 0 || this.countSourceRows() >= this.getSettings().maxRows) {
        return true;
      }
      return false;
    },
    hidden() {
      return !this.getSettings().allowInsertRow;
    }
  };
}