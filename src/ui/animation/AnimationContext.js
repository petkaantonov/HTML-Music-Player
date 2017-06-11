

import Animator from "ui/animation/Animator";

export default function AnimationContext(deps) {
    this.page = deps.page;

}

AnimationContext.prototype.LINEAR = Animator.LINEAR;
AnimationContext.prototype.SWIFT_OUT = Animator.SWIFT_OUT;
AnimationContext.prototype.EASE_IN = Animator.EASE_IN;
AnimationContext.prototype.EASE_OUT = Animator.EASE_OUT;
AnimationContext.prototype.EASE_IN_OUT = Animator.EASE_IN_OUT;
AnimationContext.prototype.EASE = Animator.EASE;
AnimationContext.prototype.DECELERATE_QUAD = Animator.DECELERATE_QUAD;
AnimationContext.prototype.DECELERATE_CUBIC = Animator.DECELERATE_CUBIC;
AnimationContext.prototype.DECELERATE_QUART = Animator.DECELERATE_QUART;
AnimationContext.prototype.DECELERATE_QUINT = Animator.DECELERATE_QUINT;
AnimationContext.prototype.ACCELERATE_QUAD = Animator.ACCELERATE_QUAD;
AnimationContext.prototype.ACCELERATE_CUBIC = Animator.ACCELERATE_CUBIC;
AnimationContext.prototype.ACCELERATE_QUART = Animator.ACCELERATE_QUART;
AnimationContext.prototype.ACCELERATE_QUINT = Animator.ACCELERATE_QUINT;
AnimationContext.prototype.RECT1_SCALE_X = Animator.RECT1_SCALE_X;
AnimationContext.prototype.RECT1_TRANSLATE_X = Animator.RECT1_TRANSLATE_X;
AnimationContext.prototype.RECT2_SCALE_X = Animator.RECT2_SCALE_X;
AnimationContext.prototype.RECT2_TRANSLATE_X = Animator.RECT2_TRANSLATE_X;

AnimationContext.prototype.createAnimator = function(dom, opts) {
    return new Animator(dom, this.page, opts);
};
