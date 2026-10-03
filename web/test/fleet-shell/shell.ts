// A stand-in for the WebGL shader package, which jsdom cannot run
class ShaderMount {
    setSpeed() {}
    dispose() {}
}

export const shadersModule = {
    ShaderMount,
    liquidMetalFragmentShader: "",
    LiquidMetalShapes: { none: 0 },
};

// jsdom cannot load another page, so link clicks keep their handlers but skip the page load
function preventLoad(event: MouseEvent) {
    event.preventDefault();
}

export function stopPageLoads(): () => void {
    window.addEventListener("click", preventLoad, true);
    return () => window.removeEventListener("click", preventLoad, true);
}
