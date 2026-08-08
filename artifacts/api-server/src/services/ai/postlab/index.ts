/**
 * PostLab Brain — public surface.
 *
 * Product-intelligence layer for PostLab AI, composed on top of the existing
 * Hamzawi AI infrastructure. See docs/POSTLAB_BRAIN.md for the architecture.
 */
export { POSTLAB_PERSONA } from "./persona";
export {
  PRODUCT_KNOWLEDGE,
  renderProductKnowledge,
  type ProductCapability,
  type CapabilityStatus,
} from "./knowledge";
export {
  PRODUCT_RULES,
  renderProductRules,
  type ProductRule,
  type RuleCategory,
} from "./rules";
export { composeSystemPrompt } from "./brain";
