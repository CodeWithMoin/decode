import Scene from "./_routed_curve";
type W={word:string;startInSeconds:number;endInSeconds:number};
const N="Every weight has a loss. Gradient descent starts high on the curve and walks downhill to the minimum.";
const S=0.3;
const WORDS:W[]=N.split(/\s+/).map((word,i)=>({word,startInSeconds:+(i*S).toFixed(3),endInSeconds:+((i+1)*S).toFixed(3)}));
export const CURVE_DUR=Math.round((WORDS.length*S+1.6)*30);
export function RoutedCurve(){return <Scene words={WORDS} />;}
