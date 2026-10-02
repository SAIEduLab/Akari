// Explicit d961dd3 regression preconditions, independent of the v2 onboarding starter.
// Fresh data on every call. Current producer/format metadata comes from the public factory;
// all legacy data, geometry, components, assets, events and program effects stay explicit.
// Self-contained: Node can require this function; browser tests can inject its toString().
function makeAkariRegressionProject(api) {
  const project = api.makeDefaultProject();
  const fixture = {
    "schema": "akari-project",
    "name": "はじめてのあかり",
    "stage": {
      "id": "stage",
      "name": "画面1",
      "width": 640,
      "height": 400,
      "backdrops": [
        {
          "id": "backdrop-1",
          "name": "空色",
          "kind": "color",
          "value": "#b3e5fc"
        }
      ],
      "backdropId": "backdrop-1"
    },
    "projectData": {
      "variables": [
        {
          "id": "var-score",
          "name": "点数",
          "initialValue": 0
        }
      ],
      "lists": [
        {
          "id": "list-names",
          "name": "名前一覧",
          "initialValue": [
            "あかり",
            "ひかり"
          ]
        }
      ]
    },
    "components": [
      {
        "id": "button-1",
        "type": "button",
        "name": "ボタン1",
        "x": 28,
        "y": 28,
        "w": 120,
        "h": 34,
        "fg": "#111111",
        "bg": "#f4f6f8",
        "fontSize": 14,
        "visible": true,
        "direction": 0,
        "scalePercent": 100,
        "text": "押してね",
        "localData": {
          "variables": [],
          "lists": []
        }
      },
      {
        "id": "sprite-1",
        "type": "sprite",
        "name": "マスコット",
        "x": 230,
        "y": 110,
        "w": 180,
        "h": 180,
        "fg": "#f5a000",
        "bg": null,
        "fontSize": 44,
        "visible": true,
        "direction": 0,
        "scalePercent": 100,
        "text": "",
        "localData": {
          "variables": [
            {
              "id": "ivar-hp",
              "name": "HP",
              "initialValue": 3
            }
          ],
          "lists": []
        },
        "costumes": [
          {
            "id": "costume-1",
            "name": "星",
            "kind": "image",
            "assetId": "asset-default-mascot"
          },
          {
            "id": "costume-2",
            "name": "丸",
            "kind": "text",
            "value": "●"
          }
        ],
        "costumeId": "costume-1"
      }
    ],
    "scripts": [
      {
        "targetId": "stage",
        "event": "start",
        "source": "点数を0にする。"
      },
      {
        "targetId": "sprite-1",
        "event": "start",
        "source": "「実行中です。キャラクターをクリックしてみよう」と言う。"
      },
      {
        "targetId": "button-1",
        "event": "click",
        "source": "みんなに「スタート」と知らせる。"
      },
      {
        "targetId": "sprite-1",
        "event": "click",
        "source": "点数に1を足す。\n右に15度回る。\nつなぐ（「点数: 」、点数）の値を言う。"
      },
      {
        "targetId": "sprite-1",
        "event": "message",
        "source": "もし 受け取った知らせが「スタート」と同じなら、次のことをする。\n  4回くり返す。\n    20歩動く。\n    端に触れていれば跳ね返る。"
      }
    ],
    "actions": [],
    "functions": [],
    "sounds": []
  };
  return Object.assign(project, fixture);
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {makeRegressionProject: makeAkariRegressionProject};
} else {
  globalThis.makeAkariRegressionProject = makeAkariRegressionProject;
}
