import Scene from "./_routed_matrix";
type W={word:string;startInSeconds:number;endInSeconds:number};
const N="Attention scores every pair of tokens in a grid. Brighter cells mean one token attends to another more strongly.";
const S=0.3;
const WORDS:W[]=N.split(/\s+/).map((word,i)=>({word,startInSeconds:+(i*S).toFixed(3),endInSeconds:+((i+1)*S).toFixed(3)}));
export const MATRIX_DUR=Math.round((WORDS.length*S+1.6)*30);
export function RoutedMatrix(){return <Scene words={WORDS} />;}
