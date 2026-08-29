import Scene from "./_routed_comparison";
type W={word:string;startInSeconds:number;endInSeconds:number};
const N="TCP is reliable but slower, because it confirms every packet. UDP is faster but can drop data, since it never waits.";
const S=0.3;
const WORDS:W[]=N.split(/\s+/).map((word,i)=>({word,startInSeconds:+(i*S).toFixed(3),endInSeconds:+((i+1)*S).toFixed(3)}));
export const COMPARISON_DUR=Math.round((WORDS.length*S+1.6)*30);
export function RoutedComparison(){return <Scene words={WORDS} />;}
