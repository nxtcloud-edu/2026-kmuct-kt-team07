import { useRef } from "react";
import { Camera, LoaderCircle, X } from "lucide-react";
import PartField from "./PartField";
import { roleLabels } from "./labels";
import type { Photo } from "./types";

const ACCEPT = "image/jpeg,image/png,image/webp";

/** Step 1 by photo: add pictures, say which part is needed, and search. */
export default function PhotoPage({
  photos,
  partQuery,
  busy,
  ready,
  available,
  onAdd,
  onRemove,
  onRole,
  onPartQuery,
  onSubmit,
  onBack,
}: {
  photos: Photo[];
  partQuery: string;
  busy: boolean;
  ready: boolean;
  available: boolean;
  onAdd: (files: FileList | null, role?: Photo["role"]) => void;
  onRemove: (index: number) => void;
  onRole: (index: number, role: Photo["role"]) => void;
  onPartQuery: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const library = useRef<HTMLInputElement>(null),
    camera = useRef<HTMLInputElement>(null),
    label = useRef<HTMLInputElement>(null);
  const full = photos.length >= 4;
  const canSubmit = ready && available && !busy && photos.length > 0;
  return (
    <section className="page photo-page" aria-labelledby="page-title">
      <button className="back-link" onClick={onBack}>
        ← 처음으로
      </button>
      <h1 id="page-title" tabIndex={-1}>
        제품 사진을 올려 주세요
      </h1>
      <p className="page-lead">
        모델명이 적힌 라벨이 보이면 가장 정확해요. 라벨이 없어도 사진 속
        모습으로 비슷한 제품을 찾아 드려요.
      </p>
      <input
        ref={library}
        className="hidden-input"
        type="file"
        accept={ACCEPT}
        multiple
        aria-label="제품 사진 선택"
        onChange={(e) => {
          onAdd(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={camera}
        className="hidden-input"
        type="file"
        accept={ACCEPT}
        capture="environment"
        aria-label="카메라로 제품 촬영"
        onChange={(e) => {
          onAdd(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={label}
        className="hidden-input"
        type="file"
        accept={ACCEPT}
        aria-label="라벨 사진 선택"
        onChange={(e) => {
          onAdd(e.target.files, "label");
          e.target.value = "";
        }}
      />
      {photos.length === 0 ? (
        <div
          className="drop-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            onAdd(e.dataTransfer.files);
          }}
        >
          <div className="drop-actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() => library.current?.click()}
            >
              사진 선택
            </button>
            <button
              className="outline-button"
              disabled={busy}
              onClick={() => camera.current?.click()}
            >
              <Camera size={18} aria-hidden="true" />
              카메라로 촬영
            </button>
          </div>
          <small>
            <span className="pointer-only">여기에 끌어다 놓아도 돼요 · </span>
            JPG, PNG, WebP · 최대 4장 · 장당 10MB
          </small>
        </div>
      ) : (
        <>
          <ul className="photo-grid">
            {photos.map((photo, i) => (
              <li className="photo" key={photo.url}>
                <img src={photo.url} alt={`추가한 사진 ${i + 1}`} />
                <button
                  className="remove-photo"
                  aria-label={`사진 ${i + 1} 삭제`}
                  onClick={() => onRemove(i)}
                >
                  <X size={16} />
                </button>
                <select
                  aria-label={`사진 ${i + 1}에 찍힌 것`}
                  value={photo.role}
                  onChange={(e) => onRole(i, e.target.value as Photo["role"])}
                >
                  {Object.entries(roleLabels).map(([key, text]) => (
                    <option key={key} value={key}>
                      {text}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <div className="photo-more">
            <button
              className="text-button"
              disabled={full || busy}
              onClick={() => library.current?.click()}
            >
              사진 추가 ({photos.length}/4)
            </button>
            <button
              className="text-button"
              disabled={full || busy}
              onClick={() => label.current?.click()}
            >
              모델명 라벨 사진 추가
            </button>
          </div>
        </>
      )}
      <PartField
        value={partQuery}
        onChange={onPartQuery}
        onEnter={() => canSubmit && onSubmit()}
      />
      <button
        className="primary wide submit"
        disabled={!canSubmit}
        onClick={onSubmit}
      >
        {busy && <LoaderCircle className="spin" size={18} />}
        {busy ? "찾는 중이에요" : "부품 찾기"}
      </button>
      {ready && !available && (
        <p className="hint">
          사진 분석 연결을 준비 중이에요. 처음 화면에서 제품 이름으로
          찾아보세요.
        </p>
      )}
      <p className="hint">
        사진은 분석이 끝나면 지우고, 찾기 기록은 최대 24시간만 보관해요.
      </p>
    </section>
  );
}
