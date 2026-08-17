import {
  ControlPanel as ControlPanelRoot,
  ControlPanelEmpty,
  ControlPanelFooter,
  ControlPanelRuleList,
  ControlPanelSection,
} from "./control-panel";
import { ControlPanelRow } from "./control-panel-row";
import { ControlPanelField } from "./field-control";
import { ControlPanelStack } from "./panel-stack";
import { ControlPanelRuleRow } from "./rule-row";

/**
 * The vocabulary, as ONE compound namespace.
 *
 * That shape is the API's main affordance: typing `ControlPanel.` shows the
 * author the whole closed set at the point of writing, and says there is no
 * sixth thing. It is also why `control-panel` is one plugin rather than an
 * umbrella of small ones — attaching members exported by sibling plugins onto a
 * single object is a cross-plugin re-export in all but syntax, which the
 * boundary checker rejects transitively. (`switch` is genuinely reusable outside
 * panels and has no namespace tie, so it IS its own plugin.)
 */
export const ControlPanel = Object.assign(ControlPanelRoot, {
  Section: ControlPanelSection,
  Row: ControlPanelRow,
  RuleList: ControlPanelRuleList,
  RuleRow: ControlPanelRuleRow,
  Field: ControlPanelField,
  Footer: ControlPanelFooter,
  Empty: ControlPanelEmpty,
  Stack: ControlPanelStack,
});
