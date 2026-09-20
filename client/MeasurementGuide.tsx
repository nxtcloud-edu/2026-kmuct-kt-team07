import { checks, type Category } from "../shared/domain";

export default function MeasurementGuide({ category }: { category: Category }) {
  if (!["lid", "gasket", "straw", "handle"].includes(category))
    return (
      <details className="measurement-guide">
        <summary>어떤 정보가 필요한가요?</summary>
        {checks[category].map((item) => (
          <p key={item.key}>
            <strong>{item.label}</strong>
            <br />
            {item.help}
          </p>
        ))}
        <p>
          제조사 설명서의 측정 위치와 단위를 따르세요. 사진만으로 치수나 적용
          여부를 확정하지 않습니다.
        </p>
      </details>
    );
  return (
    <details className="measurement-guide">
      <summary>어디를 확인하고 재나요?</summary>
      <svg
        viewBox="0 0 340 190"
        role="img"
        aria-label={
          category === "gasket"
            ? "패킹의 바깥 지름, 안쪽 지름과 옆면 두께를 재는 위치"
            : category === "straw"
              ? "빨대 양 끝의 길이와 단면 지름을 재는 위치"
              : category === "handle"
                ? "고정 구멍 중심 사이 간격과 나사를 확인하는 위치"
                : "물병의 입구와 나사산, 뚜껑 결합부를 확인하는 위치"
        }
      >
        <defs>
          <marker
            id={`arrow-${category}`}
            markerWidth="5"
            markerHeight="5"
            refX="2.5"
            refY="2.5"
            orient="auto-start-reverse"
          >
            <path d="M0 0L5 2.5L0 5z" fill="#84946e" />
          </marker>
        </defs>
        {category === "gasket" ? (
          <>
            <circle
              cx="108"
              cy="87"
              r="51"
              fill="#dce5cf"
              stroke="#8c9e77"
              strokeWidth="2"
            />
            <circle
              cx="108"
              cy="87"
              r="31"
              fill="#fafbf7"
              stroke="#8c9e77"
              strokeWidth="2"
            />
            <path
              d="M58 143H158M78 87H138"
              stroke="#84946e"
              markerStart={`url(#arrow-${category})`}
              markerEnd={`url(#arrow-${category})`}
            />
            <text x="108" y="165">
              바깥 지름(외경)
            </text>
            <text x="108" y="76">
              내경
            </text>
            <rect
              x="228"
              y="62"
              width="56"
              height="25"
              rx="10"
              fill="#dce5cf"
              stroke="#8c9e77"
            />
            <path
              d="M300 63v24"
              stroke="#84946e"
              markerStart={`url(#arrow-${category})`}
              markerEnd={`url(#arrow-${category})`}
            />
            <text x="254" y="114">
              단면·두께
            </text>
          </>
        ) : category === "straw" ? (
          <>
            <rect
              x="52"
              y="66"
              width="207"
              height="15"
              rx="6"
              fill="#dce5cf"
              stroke="#8c9e77"
            />
            <path
              d="M52 107H258"
              stroke="#84946e"
              markerStart={`url(#arrow-${category})`}
              markerEnd={`url(#arrow-${category})`}
            />
            <text x="156" y="133">
              양 끝 사이 길이
            </text>
            <circle cx="295" cy="74" r="16" fill="#dce5cf" stroke="#8c9e77" />
            <circle cx="295" cy="74" r="10" fill="#fafbf7" />
            <text x="291" y="113">
              단면 지름
            </text>
          </>
        ) : category === "handle" ? (
          <>
            <path
              d="M78 93V70q0-25 26-25h114q26 0 26 25v23"
              stroke="#8c9e77"
              strokeWidth="18"
              fill="none"
            />
            <circle cx="78" cy="103" r="6" fill="#c6875d" />
            <circle cx="244" cy="103" r="6" fill="#c6875d" />
            <path
              d="M78 129H244"
              stroke="#84946e"
              markerStart={`url(#arrow-${category})`}
              markerEnd={`url(#arrow-${category})`}
            />
            <text x="162" y="156">
              고정점 중심 사이 간격
            </text>
            <text x="165" y="25">
              고정 나사·클립도 확인
            </text>
          </>
        ) : (
          <>
            <path
              d="M78 176V83q0-13 20-24V34h79v25q20 11 20 24v93"
              fill="#dce5cf"
              stroke="#8c9e77"
              strokeWidth="2"
            />
            <ellipse
              cx="138"
              cy="34"
              rx="39"
              ry="9"
              fill="#fafbf7"
              stroke="#8c9e77"
            />
            <path
              d="M98 46q40 12 79 0m-79 9q40 12 79 0"
              fill="none"
              stroke="#8c9e77"
            />
            <path d="M186 47h49" stroke="#c6875d" />
            <text x="276" y="47">
              나사산 형태
            </text>
            <path
              d="M99 17h78"
              stroke="#84946e"
              markerStart={`url(#arrow-${category})`}
              markerEnd={`url(#arrow-${category})`}
            />
            <text x="271" y="90">
              입구 지름과
            </text>
            <text x="271" y="109">
              측정 위치 확인
            </text>
          </>
        )}
      </svg>
      <p>
        측정 위치를 설명하는 예시입니다. 실제 제품 형태와 판매처의 측정 기준을
        먼저 확인하세요. 자·캘리퍼스로 잰 값에는 mm 또는 cm를 함께 적어 주세요.
        변형된 부품은 원래 규격과 다를 수 있습니다.
      </p>
    </details>
  );
}
