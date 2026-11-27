type Doc = { title: string; note: string; sections: { h: string; p: string[] }[] };

export const privacy: Doc = {
  title: "プライバシーポリシー",
  note: "草案です。確定の法務文面ではありません（2026-11-27）。",
  sections: [
    {
      h: "方針",
      p: [
        "データを分析したり、売ったり、配ったりしません。アプリが動くのに必要な分だけ置きます。",
        "置くもの：ショップメモ・出品・写真・連絡先・引き取り依頼・ソフトログイン名（端末の localStorage）・任意の LINE ログイン。本体は Firestore、写真は Blob。",
        "アカウント削除はいつでも linelton98@gmail.com まで。運営：エルトン / Sayonara（sayonara.tokyo）。",
      ],
    },
  ],
};

export const terms: Doc = {
  title: "利用規約",
  note: "草案です。確定の法務文面ではありません（2026-11-27）。",
  sections: [
    {
      h: "使い方",
      p: [
        "引っ越しセールのショップ URL・出品・引き取り依頼のためのツールです（sayonara.tokyo）。連絡・受け渡しはジモティー / Facebook / LINE などで。",
        "出品者は掲載内容と連絡先の責任を持ちます。原則 1アカウント 1ショップ。依頼は出品者確認まで予約確定ではありません。",
        "詐欺・なりすまし・不正操作・違法出品はやめてください。運営：エルトン / Sayonara。質問・削除は linelton98@gmail.com。",
      ],
    },
  ],
};

export function LegalPage({ doc }: { doc: Doc }) {
  return (
    <main className="wrap legal">
      <h1>{doc.title}</h1>
      <p className="hint">{doc.note}</p>
      {doc.sections.map((s) => (
        <section key={s.h}>
          <h2>{s.h}</h2>
          {s.p.map((para) => <p key={para}>{para}</p>)}
        </section>
      ))}
    </main>
  );
}
