// The liquid metal button draws with WebGL, which jsdom lacks; this stand-in keeps the calls only
export const shadersModule = {
    ShaderMount: class {
        setSpeed() {}
        dispose() {}
    },
    liquidMetalFragmentShader: "",
    LiquidMetalShapes: { none: 0 },
};
