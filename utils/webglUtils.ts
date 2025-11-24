/**
 * WebGL Utility functions for Polaris Trade Chart Engine
 */

export const createShader = (gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  
  const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (success) return shader;
  
  console.error("Shader Compile Error:", gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
};

export const createProgram = (
  gl: WebGLRenderingContext, 
  vertexShaderSrc: string, 
  fragmentShaderSrc: string
): WebGLProgram | null => {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSrc);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSrc);
  
  if (!vertexShader || !fragmentShader) return null;
  
  const program = gl.createProgram();
  if (!program) return null;
  
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  
  const success = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (success) return program;
  
  console.error("Program Link Error:", gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
  return null;
};

// Standard Shaders for 2D primitives (Position + Color)
export const SHADERS = {
  // Vertex Shader: Transforms World Coordinates (Price/Index) to Clip Space
  basicVertex: `
    attribute vec2 a_position;
    attribute vec4 a_color;
    
    uniform vec2 u_resolution;
    uniform vec2 u_translation; // (offsetX, offsetY)
    uniform vec2 u_scale;       // (scaleX, scaleY)
    
    varying vec4 v_color;
    
    void main() {
       // 1. Scale and Translate
       vec2 position = (a_position * u_scale) + u_translation;
       
       // 2. Normalize to 0->1 based on resolution
       vec2 zeroToOne = position / u_resolution;
       
       // 3. Convert from 0->1 to 0->2
       vec2 zeroToTwo = zeroToOne * 2.0;
       
       // 4. Convert to Clip Space (-1 -> +1)
       // WebGL ClipSpace: (0,0) is center. (-1,-1) bottom-left, (1,1) top-right.
       // Our Input Position (0,0) is usually top-left or bottom-left depending on logic.
       // Current Logic: 0,0 is Bottom-Left.
       
       vec2 clipSpace = zeroToTwo - 1.0;
       
       gl_Position = vec4(clipSpace, 0, 1);
       v_color = a_color;
    }
  `,
  // Fragment Shader: Just output the color
  basicFragment: `
    precision mediump float;
    varying vec4 v_color;
    
    void main() {
      gl_FragColor = v_color;
    }
  `
};

/**
 * Resizes the canvas to match the display size (CSS size) * Device Pixel Ratio.
 * This ensures the canvas is sharp on Retina/High-DPI screens.
 */
export const resizeCanvasToDisplaySize = (canvas: HTMLCanvasElement): boolean => {
  // Get the device pixel ratio, default to 1 for standard screens.
  const dpr = window.devicePixelRatio || 1;
  
  // Lookup the size the browser is displaying the canvas in CSS pixels.
  const displayWidth  = Math.floor(canvas.clientWidth * dpr);
  const displayHeight = Math.floor(canvas.clientHeight * dpr);

  // Check if the canvas is not the same size.
  if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
    // Make the canvas the same size
    canvas.width  = displayWidth;
    canvas.height = displayHeight;
    return true;
  }
  return false;
};