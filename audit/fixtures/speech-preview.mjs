// Additive repair cases. Existing speech-name/B10 inputs and oracles are unchanged.
export const previewNames=['あかり','だんご'];
export const previewShortTexts=['あか','あお'];
export const previewLongTexts=['赤い花が咲いた。'.repeat(9)+'見えますか。','青い鳥が飛んだ。'.repeat(9)+'聞こえます。'];
export const previewCases=[
 {id:'speech-preview/fresh/10',scale:10,width:1180,height:756,kind:'short'},
 {id:'speech-preview/restored/10',scale:10,width:1180,height:756,kind:'short',restore:true},
 {id:'speech-preview/full-width-font/fresh/10',scale:10,width:1180,height:756,kind:'short',fullWidthFont:true},
 {id:'speech-preview/full-width-font/restored/10',scale:10,width:1180,height:756,kind:'short',fullWidthFont:true,restore:true},
 {id:'speech-preview/fresh/28',scale:28,width:1180,height:756,kind:'short'},
 {id:'speech-preview/fresh/100',scale:100,width:1180,height:756,kind:'short'},
 {id:'speech-preview/full-78/10',scale:10,width:1180,height:756,kind:'long',fullWidthFont:true},
 {id:'speech-preview/full-78/485',scale:28,width:485,height:756,kind:'long'},
];
