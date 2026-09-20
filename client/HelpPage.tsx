import { ArrowUpRight } from "lucide-react";
import { categories } from "../shared/domain";
import { external } from "./labels";
import type { RecordResult } from "./types";

/** When the catalog has no answer: search links, a maker inquiry and notes to keep. */
export default function HelpPage({
  result,
  answers,
  busy,
  onAnswers,
  onSave,
  onCopy,
  onBack,
}: {
  result: RecordResult;
  answers: Record<string, string>;
  busy: boolean;
  onAnswers: (answers: Record<string, string>) => void;
  onSave: () => void;
  onCopy: () => void;
  onBack: () => void;
}) {
  const { searches, checks, contactDraft, product } = result.paths;
  return (
    <section className="page" aria-labelledby="page-title">
      <button className="back-link" onClick={onBack}>
        ← 돌아가기
      </button>
      <p className="kicker">{categories[result.category]}</p>
      <h1 id="page-title" tabIndex={-1}>
        다른 방법으로 찾기
      </h1>
      <p className="page-lead">
        아래 링크는 검증된 상품 페이지가 아니라 검색 결과예요. 적용 모델과
        규격을 판매처에서 꼭 확인해 주세요.
      </p>
      <h2 className="list-title">검색해서 찾기</h2>
      <ul className="link-list">
        {searches.map((s) => (
          <li key={s.label}>
            <a {...external(s.url)}>
              {s.label}
              <ArrowUpRight size={15} />
            </a>
          </li>
        ))}
        {product && (
          <li>
            <a {...external(product.contact.url)}>
              브랜드 공식 안내·문의
              <ArrowUpRight size={15} />
            </a>
          </li>
        )}
      </ul>
      <h2 className="list-title">제조사에 물어보기</h2>
      <p className="hint">문의할 때 그대로 붙여 넣을 수 있는 내용이에요.</p>
      <textarea aria-label="제조사 문의 초안" readOnly value={contactDraft} />
      <button className="outline-button" onClick={onCopy}>
        문의 내용 복사
      </button>
      {checks.length > 0 && (
        <>
          <h2 className="list-title">알고 있는 규격 적어 두기</h2>
          <p className="hint">
            적어 두면 검색어와 문의 내용에 함께 들어가요. 입력한 규격만으로 맞는
            부품이라고 확정하지는 않아요.
          </p>
          <form
            className="checks"
            onSubmit={(e) => {
              e.preventDefault();
              onSave();
            }}
          >
            {checks.map((c) => (
              <label key={c.key}>
                {c.label}
                <input
                  value={answers[c.key] ?? ""}
                  maxLength={120}
                  placeholder="선택 사항"
                  onChange={(e) =>
                    onAnswers({ ...answers, [c.key]: e.target.value })
                  }
                />
                <small>{c.help}</small>
              </label>
            ))}
            <button className="outline-button" disabled={busy} type="submit">
              저장
            </button>
          </form>
        </>
      )}
    </section>
  );
}
