// Independent inputs for repair 05. The B10 source keeps its exact two-second speech.
export const speechNameNames = ['あかり', 'だんご'];
export const speechNameShortTexts = ['あか', 'あお'];
export const speechNameLongTexts = ['赤い花が咲いた。'.repeat(9)+'見えますか。', '青い鳥が飛んだ。'.repeat(9)+'聞こえます。'];
export const speechNameSource = '始めると、あかりはすぐに『あか』と2秒話します。だんごも同じ合図で動き始め、1秒待ってから『あお』と2秒話します。';
export const speechNamePositions = [{x:70,y:110}, {x:390,y:110}];
export const speechNameEdgePositions = [{x:0,y:0}, {x:460,y:220}];
export const speechNameLayoutCases = [
 {id:'speech-name/1180x757/28',width:1180,height:757,scale:28,kind:'short'},
 {id:'speech-name/1188x848/29',width:1188,height:848,scale:29,kind:'short'},
 {id:'speech-name/390x844/28',width:390,height:844,scale:28,kind:'short'},
 {id:'speech-name/1180x757/100',width:1180,height:757,scale:100,kind:'short'},
 {id:'speech-name/scale-minimum-10',width:1180,height:757,scale:10,kind:'short'},
 {id:'speech-name/scale-maximum-200',width:1180,height:757,scale:200,kind:'short'},
 {id:'speech-name/position-edges',width:1180,height:757,scale:28,kind:'short',positions:speechNameEdgePositions},
 {id:'speech-name/390-position-edges',width:390,height:844,scale:28,kind:'short',positions:speechNameEdgePositions},
 {id:'speech-name/full-78/1180',width:1180,height:757,scale:28,kind:'long'},
 {id:'speech-name/full-78/1188',width:1188,height:848,scale:29,kind:'long'},
 {id:'speech-name/full-78/390',width:390,height:844,scale:28,kind:'long'},
 {id:'speech-name/native-browser-125/short',scale:'fit',kind:'short',nativeZoom:1.25},
 {id:'speech-name/native-browser-125/full-78',scale:'fit',kind:'long',nativeZoom:1.25},
];
