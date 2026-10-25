# 明示指示と変更受入

所有者の明示指示が作業開始の条件です。相談・計画・計画への同意から実行許可を推定しません。実行範囲と終点はその指示で決まり、別の作業へ流用しません。サブエージェントは指示された実装の独立監査だけに使用します。

GitHub側の受入では、所有者本人の未編集のPRコメントにある次の許可を検査します。所有者は `SAIEduLab`（GitHub user ID `304662372`）です。PR本文・ラベル・Git author・候補ブランチ内の許可ファイルは認証された許可ではありません。作業者は自分の判断で許可を作成・拡張してはいけません。

````text
```akari-work-authorization
{
  "schema": "akari-owner-work-v1",
  "repository": "SAIEduLab/Akari",
  "branch": "<この作業のbranch>",
  "base": "<正確なbase commit SHA>",
  "head": "<正確なhead commit SHA>",
  "actions": ["implement", "test", "independent-audit", "push", "draft-pr", "monitor-actions"],
  "paths": ["<許可された正確なpath>", "<許可されたdirectory>/**"],
  "frozenPaths": ["<変更を禁止された正確なpath>"]
}
```
````

実際の変更pathすべてが許可範囲内で、凍結pathに触れていないことを検査します。改名は旧pathと新pathの両方を対象にします。未知の行為、任意のglob、別repo・branch・base・head、編集されたコメント、所有者以外のコメントは許可になりません。内部repoでは `repository` をそのrepoにします。

`Akari work authorization / owner-work-authorization` は `pull_request_target` で信頼されたbaseをcheckoutし、そこにある検査コードでGitHub APIのコメントとGit差分を読みます。候補のコードは実行しません。許可を投稿した後は、このチェックを再実行します。候補SHAが変われば所有者がそのSHAに対する許可を発行します。

受入を強制するには、mainの保護設定でこのチェックを必須にし、PR経由の変更と保護設定の迂回禁止を設定します。workflowを追加しただけで保護設定まで有効になったとは扱いません。初回導入のPRでは信頼されたmainにこのworkflowがまだないため、独立監査と機械試験を行い、導入後のチェック有効化を区別して報告します。

このチェックは無許可変更の取り込みを拒否する仕組みです。ローカルで何を始めてよいかは各repoのAGENTSに従い、機械のPASSから新たな作業権限を推定しません。
