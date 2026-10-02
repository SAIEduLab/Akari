// Independent oracle: fixed 1.0.2 specification + adult-authored CI corpus.
// These sources explicitly structure the intent; acceptance of the original prose
// is measured separately. Do not rewrite expectations from observed candidate ASTs.
export const corpusSha256='97bfcdb36a2029edf0ed696ed15635cf5330364e37233168274173cc5bfd928f';
const cat='sprite-1',dog='intent-dog',bird='intent-bird';
export const actors={cat,dog,bird};
export const scenarios=[
 {id:'CI-01',source:'ねこを画面の右へ10歩動かす。そのあと、犬に「着いたよ」と言わせる。',direction:180},
 {id:'CI-02',source:'作品を動かしたとき、ねこは、\n  10歩進む。そのあと、「できたよ」と言う。\n  犬は左を向く。'},
 {id:'CI-03',source:'「空白」キーを押すたびに、ねこは、\n  【ジャンプ】という手順を行う。',event:'keyDown',filter:{key:'空白'},actions:[{name:'ジャンプ',args:[],source:'ねこは上へ20歩動く。ねこは下へ20歩動く。'}],steps:[{key:'空白',down:true},{at:2000},{key:'空白',down:true},{key:'空白',down:false},{key:'空白',down:true}]},
 {id:'CI-04',source:'「右」キーが押されているあいだは、ねこは画面の右へ1秒に20歩の速さで動き続ける。',steps:[{key:'右',down:true},{at:500},{at:1000},{key:'右',down:false},{at:2000}]},
 {id:'CI-05',source:'「空白」キーが押されるまで待つ。10歩進む。',steps:[{at:500},{key:'空白',down:true},{at:1000},{key:'空白',down:false},{key:'空白',down:true}]},
 {id:'CI-06',source:'ねこを2秒かけて画面の右へ40歩動かす。そのあと、犬に「ぼくも行くよ」と言わせる。',steps:[{at:1000},{at:1999},{at:2000}]},
 {id:'CI-07',source:'10歩進んで、右に90度回ることを4回くり返す。'},
 {id:'CI-08',source:'2回くり返す。\n  3回くり返す。\n    今の姿のスタンプを押す。右へ20歩動く。\n  横位置を0にする。下へ20歩動く。'},
 {id:'CI-09',source:'もし点数が10点以上なら、\n  「できたね」と言う。\nそうでなければ、\n  「もう一回」と言う。\n点数の値を言う。',vars:{点数:10}},
 {id:'CI-10',source:'もし条件（かぎかつ（赤接触または青接触））が成り立つなら、\n  「開いた」と言う。',vars:{かぎ:false,赤接触:false,青接触:true}},
 {id:'CI-11',source:'点数を0点にする。3回くり返す。\n  点数を1点増やす。\nつなぐ（「いまは」、点数の数だけ、「点だよ」）を言う。'},
 {id:'CI-12',source:'「名前は何ですか」とたずねて、返事を待つ。保存名を答えにする。つなぐ（保存名、「さん、こんにちは」）を言う。',steps:[{at:1000},{answer:'青い ねこ「※」'},{at:2000}]},
 {id:'CI-13',source:'持ち物の2番目に「かさ」を入れる。',lists:{持ち物:['本','ぼうし']}},
 {id:'CI-14',source:'参加者の中身を先頭から一つずつ見て、次のことを行う。\n  今見ているものの値を言う。2秒待つ。',lists:{参加者:['アキ','ハル','アキ']},steps:[{at:2000},{at:4000},{at:6000}]},
 {id:'CI-15',source:'【ジャンプ】という手順を行う。【ジャンプ】という手順を行う。',actions:[{name:'ジャンプ',args:[],source:'ねこは上へ20歩動く。ねこは下へ20歩動く。'}]},
 {id:'CI-16',source:'長さを20として、【四角をかく】という手順を行う。長さを50として、【四角をかく】という手順を行う。',vars:{長さ:99},actions:[{name:'四角をかく',args:['長さ'],source:'4回くり返す。\n  長さ歩進む。右に90度回る。'}]},
 {id:'CI-17',source:'合計を（個数を3、ねだんを80として、【代金をもとめる】で求めた答え）＋10にする。',functions:[{name:'代金をもとめる',args:['個数','ねだん'],source:'個数×ねだんを答えとして返す。'}]},
 {id:'CI-18',source:'みんなに「出発」と知らせる。その知らせを受けて始めたことが全部終わるまで待つ。そのあと、ねこは10歩進む。',extraScripts:[{targetId:dog,event:'message',filter:{message:'出発'},source:'1秒待つ。「犬完了」と言う。'},{targetId:bird,event:'message',filter:{message:'出発'},source:'2秒待つ。「鳥完了」と言う。'}],steps:[{at:1000},{at:1999},{at:2000}]},
 {id:'CI-19',source:'5回くり返す。\n  自分の分身を作る。',extraScripts:[{targetId:cat,event:'cloneStart',source:'10歩進む。1秒待つ。この分身だけを消す。'}],steps:[{at:1000}]},
 {id:'CI-20',source:'背景を「森の絵」に変える。音「こんにちは」を鳴らす。ねこは10歩進む。',assetFixture:true,steps:[{at:499},{at:500}]},
];
export const ambiguities=[
 {id:'AMB-SPEED',intent:'CI-04',source:'右キーをおしている間、ねこは10歩動く。',choices:['全部で10歩','1秒に10歩']},
 {id:'AMB-LOGIC',intent:'CI-10',source:'もし点数が10以上で、残りが1以上か、当たりが1以上なら、\n  10歩進む。',choices:['両方','どちらか']},
 {id:'AMB-EDGE',intent:'CI-09',source:'点数が10点になったら、ねこは10歩進む。',choices:['状態','変化']},
 {id:'AMB-REPEAT',intent:'CI-07',source:'10歩進む。右に曲がる。4回くり返す。',choices:['進む','回る']},
 {id:'AMB-TARGET',intent:'CI-02',source:'それを右へ10歩動かす。',choices:['ねこ','犬']},
 {id:'AMB-LIST',intent:'CI-13',source:'持ち物に「かさ」を入れる。',choices:['最後','置き換え']},
 {id:'AMB-SOUND',intent:'CI-20',source:'こんにちはを言う。',choices:['台詞','音']},
];
export const numericOracles=[
 ['－2＾2',-4],['2＾3＾2',512],['（－2）＾2',4],['1＋2×3',7],['（1＋2）×3',9],['１．５＋−０．５',1],
 ['余り（17、5）',2],['四捨五入（1.5）',2],['切り上げ（1.2）',2],['切り捨て（1.8）',1],['絶対値（－3）',3],['平方根（81）',9],
 ['正弦（30）',0.5],['余弦（60）',0.5],['正接（45）',1],['逆正弦（0.5）の数だけ',30],['逆余弦（0.5）の数だけ',60],['逆正接（1）の数だけ',45],
 ['自然対数（1）',0],['常用対数（100）',2],['指数（0）',1],['最小（3、－2、5）',-2],['最大（3、－2、5）',5],['数（「12.5」）',12.5],
];
