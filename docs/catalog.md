# 카탈로그 관리

파일: `data/catalog.json`. 버전 1. 마지막 내용 검수: 2026-09-20.

## 추가·수정 절차

1. 제품의 정확한 브랜드·모델·용량·세대를 확인한다. 알 수 없는 용량·세대는 `null`. 지역 차이를 기록한다.
2. 부품의 출처(`oem`, `aftermarket`, `generic`, `unknown`)와 판매 항목의 상태(`new`, `used`, `unknown`)를 따로 저장한다. 중고 정품도 표현할 수 있다.
3. 각 적용 관계에 제품 변형 ID·부품 ID·적용/제외/미확인 주장, 근거 제공 주체, 요약, 미확인 조건, HTTPS URL, 확인 날짜를 기록한다.
4. 판매처의 문구를 `product_manufacturer`로 표시하지 않는다. 대체 부품 제작자의 주장도 `part_manufacturer`로 별도 구분한다. 판매 페이지와 근거 페이지는 다를 수 있다.
5. `scope: content_reviewed`는 내용을 직접 검토했을 때만 설정한다. 페이지 접근만 성공했으면 `link_only`. 자동 링크 검사는 이 필드를 변경하지 않는다.
6. 명시적 근거 없이 단종·품절·비호환을 입력하지 않는다. 재고는 판매 옵션을 구체적으로 확인할 수 없으면 `unknown`이다. 공식 판매 종료는 `unavailable`이며 다른 판매처의 잔여 재고를 부정하지 않는다.
7. 패킹/빨대/손잡이 상품을 추가할 때는 재질·규격·사용 조건과 모델별 적용 근거를 실제 자료로 확인한다. 외형 유사나 사용자가 입력한 치수만으로 호환 확정하지 않는다.
8. 임시 JSON을 `npm run catalog:import -- /path/file.json`로 검증·교체하고 `npm run check`를 실행한다. 가져오기 명령은 `data/history/`에 전후 내용·해시·확인 시각·작업자 유형을 자동 보관한 뒤 파일을 원자적으로 교체한다. 변경 이력은 코드와 함께 버전 관리한다.
9. 변경한 카탈로그는 서버 재시작 후 반영된다. 스키마 검증은 사실의 정확성을 보증하지 않는다.

## 초기 자료

| 자료 | 확인한 범위 |
|---|---|
| [Nalgene 16oz](https://nalgene.com/product/16oz-wide-mouth-bottle/) / [32oz](https://nalgene.com/product/32oz-wide-mouth-bottle/) / [48oz Silo](https://nalgene.com/product/48oz-wide-mouth-silo-bottle/) | 실제 제품 이름·용량과 공식 제품 링크 |
| [Nalgene Wide Mouth Cap](https://nalgene.com/product/wide-mouth-cap/) | 32·48oz Wide Mouth용 표기, 캡 63mm·나사식 |
| [Nalgene 16oz Cap](https://nalgene.com/product/16oz-wide-mouth-cap/) | 16oz Wide Mouth 전용 표기, 캡 53mm·나사식 |
| [Hydro Flask 32oz](https://www.hydroflask.com/32-oz-wide-mouth) / [Flex Cap](https://www.hydroflask.com/wide-mouth-flex-cap) | 공식 제품 및 Wide Mouth용 캡 설명. 자동 HTTP 검사 403은 별도 accessNote로 표시 |
| [humangear 적용 대상](https://www.humangear.com/capcap-compatibility) | capCAP+와 2008–2018 구형의 적용 차이. Nalgene 최신 세부 재질·세대는 추가 확인 조건으로 유지 |
| [capCAP+ 판매](https://www.humangear.com/shop/p/capcap) | 대체 부품 제작자의 실제 상품 페이지 |
| [구형 판매 종료](https://www.humangear.com/capcap-legacy) | 구형 capCAP의 공식 판매 종료. 다른 판매처 재고까지 판단하지 않음 |
| [Nalgene 문의](https://nalgene.com/contact/) / [Hydro Flask 문의](https://www.hydroflask.com/contact-us) | 공식 문의 페이지. 수리 가능 여부·국내 접수 여부는 미확인 |

이 카탈로그의 부품 사진은 재배포하지 않는다. UI 제품 그림은 특정 모델의 실물 사진이 아닌 자체 SVG 일러스트이며 그렇게 표시한다.

## 판정 규칙

적용과 제외가 함께 있으면 `conflict`. 제외 근거가 있으면 `excluded`. 적용 근거가 없으면 `unverified`. 조건이 있거나 내용 미검토·180일 이상 지난 근거면 `check_required`. 나머지는 `source_supported`로 출처의 적용 대상 표기만 안내한다. 이 상태가 직접 장착 성공을 뜻하지 않는다.

테스트에는 상충 근거, 오래된 근거, 미검수 링크, 미확인 재고, 판매 종료, 적용 제외를 포함한다. 실제 카탈로그에는 가상 판매처·범용 상품·장착 성공 사례를 넣지 않는다.

## 2026-09-20 국내 카탈로그 확장

1차 확장 시점: 총 제품 20개, 부품 22개(판매 옵션별 항목 포함), 판매 항목 22개, 적용 근거 44개. 국내 써모스 모델 16개를 추가했다. 모든 신규 모델은 공식 적용 목록에 명시된 부품과 국내 공식몰 판매 페이지를 가진다. 색상만 다른 본체를 별도 제품으로 늘리지 않았다. FHL은 단종 여부를 추정하지 않고 공식 교환용 부품 자료에 등재된 모델로 설명한다.

| 계열 | 등록 모델 | 등록 부품 및 확인 자료 |
|---|---|---|
| JNL | 255K·355K·505K·605K·755K | [공용 패킹](https://thermosshop.kr/product/jnl-패킹세트jnl-공용/472/), [마개 유닛](https://thermosshop.kr/product/뉴-데일리-원터치-텀블러jnl-500ml-마개-유닛/1077/) — 공식 안내에 JNL 용량 간 마개 공용 명시 |
| JNR 시즌3 | 252K·352K·502K | [패킹](https://thermosshop.kr/product/jnr-패킹세트jnr-공용/547/), [시즌3 마개](https://thermosshop.kr/product/jnr-시즌3-마개-유닛/1148/) — 본체 색상 코드와 옵션 대조 |
| FHL | 400K·550K | [패킹](https://thermosshop.kr/product/fhl-패킹fhl-공용/482/), [스트로세트](https://thermosshop.kr/product/fhl-스트로세트/592/), [캡유닛](https://thermosshop.kr/product/fhl-스트로-캡유닛/594/) — 빨대 포함 품목은 용량별 옵션 분리 |
| JOS | 400K·550K·750K | [패킹](https://thermosshop.kr/product/jos-패킹-세트/1240/), 용량별 마개(상품 번호 1242·1243·1244) — 각 마개 적용 목록의 모델만 연결 |
| JOW | 600K·800K·1000K | [JOX/JOW 패킹](https://thermosshop.kr/product/jow-패킹/1209/), 용량별 마개(상품 번호 1207·1208·1267) — 패킹 공용을 마개 공용으로 확대하지 않음 |

- `offers.market`: 국내/해외/미확인. 기존 파일 호환을 위해 누락 시 `unknown`. 국내는 공식몰의 전국 택배 배송 안내를 확인했을 때 사용하며 국내 제조를 뜻하지 않는다.
- `offers.optionLabel`: 한 URL에 여러 모델 옵션이 있는 경우 구매자가 선택할 옵션. FHL 빨대·캡은 옵션을 선택해야 하므로 `check_required`를 유지한다.
- 제품 탐색에 사용되는 `availableCategories`, `domesticCategories`는 매번 적용 근거와 판매 항목에서 계산한다. 제외·상충·근거 미확인은 부품 보유 표시로 승격하지 않는다. 재고 `unknown`은 유지한다.
- `GET /api/catalog`는 `q`, `brand`, `capacity`, `category`, `domestic=true` 필터를 지원한다. 부분 문자열 탐색과 OCR의 정확 일치 판정을 분리했다.
- 41개 URL의 HTTP 접근 검사: 39개 200, 기존 Hydro Flask 제품·캡 2개 403. 신규 써모스 경로는 모두 200. HTTP 검사는 재고·호환·본문 변경 자동 검증이 아니다.
- 물병·텀블러 범위다. 손잡이 단품, 범용품, 중고 개별 매물은 확인된 상품으로 추가하지 않았으며 검색·문의 경로를 유지한다. 실제 장착 검증은 수행하지 않았다.


## 2026-09-20 추가 브랜드 확장

현재 **제품 52개, 부품 46개, 판매 46개, 적용·제외 근거 101개**, 제품 브랜드 5개다. 1차 확장 이후 킨토 17개, 조지루시 15개 모델과 부품 24개를 추가했다. 국내 판매 경로를 가진 모델은 48개이며 해당 표시가 재고 확보나 실제 장착 검증을 의미하지 않는다.

| 브랜드 | 제품군과 용량 | 근거와 주체 |
|---|---|---|
| 킨토 | 워터보틀 300·500·950ml, 워터텀블러 550ml | [300/500 캡](https://kinto.kr/shop/item.php?it_id=80132), [950 캡](https://kinto.kr/shop/item.php?it_id=80397), [워터텀블러 캡](https://kinto.kr/shop/item.php?it_id=80151). 국내 운영사 새뉴의 판매처 명시로 저장. 보틀/텀블러·용량 간 명시적 적용 제외도 기록 |
| 킨토 | 엑티브 텀블러 600·800ml, 엑티브 보틀 600·950ml | [텀블러 캡](https://kinto.kr/shop/item.php?it_id=80281), [보틀 패킹](https://kinto.kr/shop/item.php?it_id=80180). 유사 명칭을 별도 제품군으로 유지 |
| 킨토 | 플러그 투고 240·360ml, 플레이 300·480ml, 투고 보틀 360·480ml | [플러그 뚜껑](https://kinto.kr/shop/item.php?it_id=80431), [플레이 300 빨대](https://kinto.kr/shop/item.php?it_id=80370), [480 빨대](https://kinto.kr/shop/item.php?it_id=80368). 빨대는 전용 용량별로 구분 |
| 킨토 | 워크아웃 보틀 480ml, 트레일 텀블러 580·1080ml | [워크아웃 패킹](https://kinto.kr/shop/item.php?it_id=20309)은 제품군 표기 근거이므로 480ml 본체 및 S/L 구성의 판매처 확인 조건 유지. [트레일 패킹](https://kinto.kr/shop/item.php?it_id=80221)은 두 용량 명시 |
| 조지루시 | SU-BA36·48, SX-JS30·40, SM-RS50·65 | 공식 [S110](https://zojirushi.co.kr/product/detail.html?product_no=152), [S104](https://zojirushi.co.kr/product/detail.html?product_no=154), [S103](https://zojirushi.co.kr/product/detail.html?product_no=153) 적용 모델 목록 |
| 조지루시 | SM-VB60·72·95, SM-VS83·95, SM-VH48·60·72·95 | 공식 [BB780807L](https://zojirushi.co.kr/product/detail.html?product_no=149) 적용 모델과 계열별 색상 옵션. 같은 브랜드의 다른 뚜껑을 임의 연결하지 않음 |

- 킨토는 `seller`, 조지루시코리아 공식몰은 `product_manufacturer`로 구분한다. 모든 신규 관계는 구매 전 모델·용량·색상 옵션 확인 조건을 가진다.
- 킨토 80368(플레이 480 빨대), 80059(투고 360 빨대), 80071(투고 캡), 80180(엑티브 보틀 패킹)은 실제 상세 페이지의 품절 문구를 확인했다. 이 상태는 호환 판정과 독립이다. 다른 상품의 옵션별 재고는 `unknown`이다. 조지루시 HTML에는 표시/숨김 구매·품절 템플릿이 함께 있으므로 전체 품절로 추정하지 않았다.
- 구매 링크는 상품 상세 URL이다. 킨토의 `collections.php`는 부품 ID로 접근할 때 빈 목록을 보여줄 수 있어 실제 `item.php` 상세를 확인하고 사용했다.
- 신규 58개 URL 모두 HTTP 200. 전체 99개 중 96개 200, 기존 Hydro Flask 3개 403은 접근 안내를 유지했다. 내용 검수와 HTTP 검사를 구분하며 가격·실시간 재고·장착 성공을 보장하지 않는다.
- 카탈로그 변경 이력은 `data/history/`, 추가 검증은 `artifacts/catalog-brands-verification.json`에 남긴다. 컨테이너 배포 전에는 최신 데이터로 이미지를 다시 빌드해야 한다.

## 주문 상태 확인과 만료

- `stockCheckedAt`은 적용 근거의 `source.checkedAt`과 별개의 UTC 시각이다. `in_stock` 등록에는 확인 시각과 정확한 `optionLabel`이 필수다.
- 주문 가능은 판매처의 선택 옵션·수량 입력·활성화된 주문 버튼을 확인했다는 뜻이다. 결제 완료나 창고 재고·배송 보장이 아니며 UI에도 이 범위를 표시한다.
- 긍정·품절 표시는 24시간 후 또는 미래 시각이면 응답의 `availability.stock`을 `unknown`으로 표시한다. 원래 `stock`과 시각은 이력으로 보존한다. 판매 종료와 적용 근거는 재고 시각 때문에 바뀌지 않는다.
- 국내 주문 가능 필터는 제외·상충 근거가 없는 부품 중 최근 확인된 판매 옵션만 사용한다. HTTP 200만으로 이 필드를 갱신하지 않는다.
- 2026-09-20 브라우저에서 킨토 80370(화이트_80370), 80380(투명_80121), 80280(블랙_80280)의 수량 1 및 활성화된 장바구니 버튼을 확인했다. 3개 부품이 5개 등록 모델에 연결된다. 장바구니 추가·결제는 수행하지 않았다.
