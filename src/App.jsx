import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Nfc,
  PlusCircle,
  ShieldAlert,
  Syringe,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

// 1호실(남성 4병상), 2호실(여성 4병상) 초기 병동 데이터
const INITIAL_BEDS = [
  { id: '1-1', room: 1, bed: 1, gender: 'M', age: 68, patient: '김*수(10482910)', diagnosis: '폐렴 (Pneumonia)' },
  { id: '1-2', room: 1, bed: 2, gender: 'M', age: 54, patient: '이*호(10519283)', diagnosis: '급성 췌장염' },
  { id: '1-3', room: 1, bed: 3, gender: 'M', age: 72, patient: '박*진(10394812)', diagnosis: '위장관 출혈 의심' },
  { id: '1-4', room: 1, bed: 4, gender: 'M', age: 61, patient: '최*영(10628374)', diagnosis: '발작성 심실상성 빈맥(PSVT)' },
  { id: '2-1', room: 2, bed: 1, gender: 'F', age: 59, patient: '정*희(10411209)', diagnosis: '유방암 항암치료 후 호중구감소증' },
  { id: '2-2', room: 2, bed: 2, gender: 'F', age: 76, patient: '강*자(10293847)', diagnosis: '만성 신부전 / 빈혈' },
  { id: '2-3', room: 2, bed: 3, gender: 'F', age: 65, patient: '윤*숙(10583920)', diagnosis: '담낭염 수술 후 회복' },
  { id: '2-4', room: 2, bed: 4, gender: 'F', age: 52, patient: '조*미(10671234)', diagnosis: '혈소판 감소증' },
];

// 5종 고위험 약물 및 혈액제제 모니터링 DB
const MEDICATIONS = [
  {
    id: 'metoclopramide',
    name: 'IV 맥페란 (Metoclopramide)',
    realMinutes: 5,
    demoSeconds: 5,
    sideEffects: [
      '추체외로 증상(EPS): 근긴장이상, 안구운동발작, 정좌불능 여부',
      '중추신경계: 급성 졸음, 어지러움, 불안감 발생 확인',
      '오심·구토 완화 효과 사정',
    ],
  },
  {
    id: 'vancomycin',
    name: 'IV 반코마이신 (Vancomycin)',
    realMinutes: 15,
    demoSeconds: 8,
    sideEffects: [
      '레드맨 증후군(Red Man Syndrome): 안면·목·상체 홍조 및 가려움증',
      '활력징후: 급격한 저혈압 발생 여부 (발생 시 주입 속도 감속)',
      '정맥염(Phlebitis) 및 주사 부위 발적·통증 확인',
    ],
  },
  {
    id: 'ffp',
    name: 'IV 신선동결혈장 (FFP)',
    realMinutes: 15,
    demoSeconds: 10,
    sideEffects: [
      '급성 수혈 부작용: 발열, 오한, 두드러기, 호흡곤란, 흉통/요통',
      '수혈 시작 후 15분 활력징후(V/S) 측정 및 수혈 전 수치와 비교',
      'TACO(수혈관련 순환과부하): 경정맥 팽창, 수포음 청진 여부',
    ],
  },
  {
    id: 'platelet',
    name: 'IV 혈소판 (Platelet Concentrate)',
    realMinutes: 15,
    demoSeconds: 10,
    sideEffects: [
      '발열성 비용혈성 수혈 반응(FNHTR) 및 알레르기(발진, 가려움)',
      '급성 패혈성 반응(고열, 오한, 저혈압) 집중 관찰',
      '출혈 경향(점상출혈, 잇몸출혈 등) 호전 여부 확인',
    ],
  },
  {
    id: 'adenosine',
    name: 'IV 아데노신 (Adenosine)',
    realMinutes: 1,
    demoSeconds: 3,
    sideEffects: [
      '일시적 무수축(Asystole) 및 심한 서맥, 방실차단 (EKG 리듬 확인)',
      '일과성 안면 홍조, 흉부 압박감, 호흡곤란 회복 여부',
      '동율동(Normal Sinus Rhythm) 전환 성공 여부 기록',
    ],
  },
];

// 초록 -> 노랑 -> 빨강 부드러운 그라데이션 계산 함수
function getTransitionColor(progress) {
  const clamped = Math.max(0, Math.min(1, progress));
  // Hue: 142(초록) -> 45(노랑/주황) -> 0(빨강)
  const hue = Math.round(142 * (1 - clamped));
  const sat = Math.round(72 + 12 * clamped);
  const light = Math.round(40 + 6 * Math.sin(clamped * Math.PI));
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

export default function App() {
  const [demoMode, setDemoMode] = useState(true); // true: 시연용(초), false: 실제 임상(분)
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [activeTimers, setActiveTimers] = useState({}); // { '1-3': { med, startTime, durationSec } }
  const [now, setNow] = useState(Date.now());

  // EMR 투약 입력 상태
  const [selectedBedId, setSelectedBedId] = useState('1-3');
  const [selectedMedId, setSelectedMedId] = useState('metoclopramide');

  // 모달 상태
  const [stationAlertBed, setStationAlertBed] = useState(null); // 스테이션 카드 클릭 시 가이드 모달
  const [nfcBedId, setNfcBedId] = useState(null); // 침상 NFC 태그 시 간호사 PDA 사정 모달
  const [checkedItems, setCheckedItems] = useState({});

  const audioCtxRef = useRef(null);

  // 0.1초마다 현재 시각 갱신 (부드러운 색상 변화용)
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(interval);
  }, []);

  // 2x 초과(점멸 상태) 병상이 하나라도 있을 때만 경고음 발생
  const hasFlashingBed = Object.entries(activeTimers).some(([, timer]) => {
    const elapsed = (now - timer.startTime) / 1000;
    return elapsed >= timer.durationSec * 2;
  });

  useEffect(() => {
    if (!hasFlashingBed || !soundEnabled) return;

    const playBeep = () => {
      try {
        if (!audioCtxRef.current) {
          audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') ctx.resume();

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } catch (e) {
        // 브라우저 자동재생 정책 무시
      }
    };

    playBeep();
    const beepInterval = setInterval(playBeep, 1000);
    return () => clearInterval(beepInterval);
  }, [hasFlashingBed, soundEnabled]);

  // 투약 시작 핸들러
  const handleAdminister = (bedId = selectedBedId, medId = selectedMedId) => {
    const med = MEDICATIONS.find((m) => m.id === medId);
    if (!med) return;
    const durationSec = demoMode ? med.demoSeconds : med.realMinutes * 60;

    setActiveTimers((prev) => ({
      ...prev,
      [bedId]: {
        med,
        startTime: Date.now(),
        durationSec,
      },
    }));
  };

  // NFC 태그 열기
  const openNfcModal = (bedId) => {
    setNfcBedId(bedId);
    setCheckedItems({});
  };

  // NFC 현장 사정 완료 후 스테이션 초록색 복구
  const handleCompleteAssessment = () => {
    if (!nfcBedId) return;
    setActiveTimers((prev) => {
      const next = { ...prev };
      delete next[nfcBedId];
      return next;
    });
    setNfcBedId(null);
    setStationAlertBed(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 font-sans select-none">
      {/* 상단 헤더 */}
      <header className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/40 rounded-xl">
            <Activity className="w-7 h-7 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">
              Smart Med-Watch <span className="text-emerald-400 text-base font-medium ml-1">투약 후 부작용 모니터링 시스템</span>
            </h1>
            <p className="text-xs md:text-sm text-slate-400">
              간호사 스테이션 패드 대시보드 · 침상 NFC 현장 인증 연동 프로토타입
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* 시연 퀵스타트 버튼 */}
          <button
            onClick={() => handleAdminister('1-3', 'metoclopramide')}
            className="px-3.5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold shadow-lg shadow-violet-900/30 transition cursor-pointer"
          >
            ⚡ 1:3 맥페란 퀵투약
          </button>

          {/* 시간 모드 전환 */}
          <button
            onClick={() => setDemoMode(!demoMode)}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium border transition cursor-pointer ${
              demoMode
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-300'
                : 'bg-sky-500/15 border-sky-500/50 text-sky-300'
            }`}
          >
            {demoMode ? '⏱ 시연 단축 모드 (3~10초)' : '🏥 실제 임상 모드 (1~15분)'}
          </button>

          {/* 음소거 토글 */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 cursor-pointer"
            title="점멸 경고음 설정"
          >
            {soundEnabled ? <Volume2 className="w-5 h-5 text-emerald-400" /> : <VolumeX className="w-5 h-5 text-slate-500" />}
          </button>
        </div>
      </header>

      {/* 메인 레이아웃: 좌측 스테이션 패드 모니터(넓게) + 우측 시뮬레이션 컨트롤러 */}
      <main className="max-w-7xl mx-auto mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 좌측: 간호사 스테이션 태블릿 모니터 영역 (8컬럼) */}
        <section className="lg:col-span-8 bg-slate-900 border-2 border-slate-800 rounded-2xl p-5 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="text-lg font-bold text-white">1·2호실 담당 간호사 스테이션 모니터</h2>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-600 inline-block" /> 정상/대기</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500 inline-block" /> 작용시간 진행</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-600 inline-block" /> 1x 점화 / 2x 점멸</span>
            </div>
          </div>

          {/* 1호실 (남성 병실) */}
          <div className="mb-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-sky-400 mb-2 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> 1호실 (남성 병실 · 4병상)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {INITIAL_BEDS.filter((b) => b.room === 1).map((bed) => (
                <BedCard
                  key={bed.id}
                  bed={bed}
                  timer={activeTimers[bed.id]}
                  now={now}
                  onClick={() => activeTimers[bed.id] && setStationAlertBed({ bed, timer: activeTimers[bed.id] })}
                />
              ))}
            </div>
          </div>

          {/* 2호실 (여성 병실) */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-rose-400 mb-2 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> 2호실 (여성 병실 · 4병상)
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {INITIAL_BEDS.filter((b) => b.room === 2).map((bed) => (
                <BedCard
                  key={bed.id}
                  bed={bed}
                  timer={activeTimers[bed.id]}
                  now={now}
                  onClick={() => activeTimers[bed.id] && setStationAlertBed({ bed, timer: activeTimers[bed.id] })}
                />
              ))}
            </div>
          </div>
        </section>

        {/* 우측: EMR 투약 연동 & 침상 NFC 시뮬레이터 (4컬럼) */}
        <aside className="lg:col-span-4 flex flex-col gap-5">
          {/* STEP 1: EMR 투약 기록 입력 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 text-sky-400 font-bold text-sm mb-3">
              <Syringe className="w-4 h-4" />
              <span>STEP 1 · EMR 투약 수행 기록</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">대상 환자 (병상 선택)</label>
                <select
                  value={selectedBedId}
                  onChange={(e) => setSelectedBedId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                >
                  {INITIAL_BEDS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.room}:{b.bed} · {b.patient} ({b.gender}/{b.age}세)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">고위험 약물 / 혈액제제</label>
                <select
                  value={selectedMedId}
                  onChange={(e) => setSelectedMedId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                >
                  {MEDICATIONS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (임상 {m.realMinutes}분 / 시연 {m.demoSeconds}초)
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => handleAdminister()}
                className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" /> 투약 완료 및 타이머 시작
              </button>
            </div>
          </div>

          {/* STEP 2: 병실 침상 앞 NFC 태그 시뮬레이터 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex-1">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm mb-1">
              <Nfc className="w-4 h-4" />
              <span>STEP 2 · 병실 침상 앞 NFC 태그</span>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              스테이션 화면에서는 알람 해제가 불가능합니다. 해당 침상 앞 NFC를 태그해 사정을 완료하세요.
            </p>

            <div className="grid grid-cols-4 gap-2">
              {INITIAL_BEDS.map((b) => {
                const timer = activeTimers[b.id];
                const elapsed = timer ? (now - timer.startTime) / 1000 : 0;
                const isDue = timer && elapsed >= timer.durationSec;

                return (
                  <button
                    key={b.id}
                    onClick={() => openNfcModal(b.id)}
                    className={`py-2.5 px-2 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition cursor-pointer ${
                      isDue
                        ? 'bg-red-600/25 border-red-500 text-red-200 animate-pulse'
                        : timer
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-200'
                        : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:bg-slate-800'
                    }`}
                  >
                    <Nfc className="w-4 h-4" />
                    <span>{b.room}:{b.bed}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </main>

      {/* 모달 1: 스테이션 패드에서 병상 카드 터치 시 (해제 버튼 없음 강조) */}
      {stationAlertBed && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border-2 border-red-500/70 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-7 h-7 text-red-500" />
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {stationAlertBed.bed.room}:{stationAlertBed.bed.bed} 병상 부작용 관찰 가이드
                  </h3>
                  <p className="text-xs text-slate-400">
                    {stationAlertBed.bed.patient} · {stationAlertBed.bed.gender}/{stationAlertBed.bed.age}세
                  </p>
                </div>
              </div>
              <button onClick={() => setStationAlertBed(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-red-950/50 border border-red-500/40 rounded-xl p-3.5 mb-4">
              <div className="text-sm font-bold text-red-300 mb-1">
                💊 {stationAlertBed.timer.med.name}
              </div>
              <p className="text-xs text-red-200">
                투여 후 경과 시간: <strong>{Math.floor((now - stationAlertBed.timer.startTime) / 1000)}초</strong>
              </p>
            </div>

            <div className="space-y-2 mb-5">
              <div className="text-xs font-semibold text-slate-300">중점 관찰 부작용 및 간호 사정 항목:</div>
              <ul className="space-y-1.5 text-xs text-slate-200 bg-slate-800/80 p-3.5 rounded-xl">
                {stationAlertBed.timer.med.sideEffects.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-red-400 font-bold">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-3 text-xs text-amber-200 mb-4">
              🔒 <strong>환자안전 잠금 정책:</strong> 스테이션 모니터에서는 알람을 해제할 수 없습니다. 직접 병실로 이동하여 <strong>침상 앞 NFC 태그</strong>를 스캔하세요.
            </div>

            <button
              onClick={() => setStationAlertBed(null)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold cursor-pointer"
            >
              확인 (창 닫기)
            </button>
          </div>
        </div>
      )}

      {/* 모달 2: 침상 앞 NFC 태그 시 간호사 모바일 PDA 사정 화면 */}
      {nfcBedId && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          {(() => {
            const bed = INITIAL_BEDS.find((b) => b.id === nfcBedId);
            const timer = activeTimers[nfcBedId];
            return (
              <div className="bg-slate-900 border-2 border-emerald-500/70 rounded-2xl max-w-md w-full p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-300 text-xs font-bold">
                      NFC 침상 인증 완료
                    </span>
                    <span className="text-sm font-bold text-white">{bed.room}:{bed.bed} 병상</span>
                  </div>
                  <button onClick={() => setNfcBedId(null)} className="text-slate-400 hover:text-white cursor-pointer">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="bg-slate-800 rounded-xl p-3.5 mb-4">
                  <div className="text-sm font-bold text-white">{bed.patient}</div>
                  <div className="text-xs text-slate-400">
                    {bed.gender === 'M' ? '남성' : '여성'} / {bed.age}세 · 진단명: {bed.diagnosis}
                  </div>
                </div>

                {timer ? (
                  <>
                    <div className="text-xs font-bold text-emerald-400 mb-2">
                      📋 {timer.med.name} 투여 후 부작용 사정 체크리스트
                    </div>
                    <div className="space-y-2 mb-5">
                      {timer.med.sideEffects.map((effect, idx) => (
                        <label
                          key={idx}
                          className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-800/80 border border-slate-700 cursor-pointer hover:border-emerald-500/50"
                        >
                          <input
                            type="checkbox"
                            checked={!!checkedItems[idx]}
                            onChange={(e) =>
                              setCheckedItems((prev) => ({ ...prev, [idx]: e.target.checked }))
                            }
                            className="mt-0.5 accent-emerald-500 w-4 h-4"
                          />
                          <span className="text-xs text-slate-200 leading-relaxed">{effect}</span>
                        </label>
                      ))}
                    </div>

                    <button
                      onClick={handleCompleteAssessment}
                      className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/40 cursor-pointer"
                    >
                      <CheckCircle2 className="w-5 h-5" /> 현장 사정 완료 및 스테이션 초록색 복구
                    </button>
                  </>
                ) : (
                  <div className="text-center py-6">
                    <p className="text-sm text-slate-300 mb-4">
                      현재 해당 병상에 활성화된 투약 모니터링 알람이 없습니다.
                    </p>
                    <button
                      onClick={() => setNfcBedId(null)}
                      className="px-5 py-2 rounded-xl bg-slate-800 text-sm text-white cursor-pointer"
                    >
                      닫기
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// 개별 병상 카드 컴포넌트
function BedCard({ bed, timer, now, onClick }) {
  let bgColor = 'hsl(142, 72%, 36%)'; // 기본 초록색
  let statusText = '모니터링 대기 (정상)';
  let isFlashing = false;
  let elapsedSec = 0;

  if (timer) {
    elapsedSec = (now - timer.startTime) / 1000;
    const progress = elapsedSec / timer.durationSec;

    if (progress < 1) {
      // 0 ~ 1x: 초록 -> 노랑 -> 빨강 서서히 변색
      bgColor = getTransitionColor(progress);
      const remain = Math.ceil(timer.durationSec - elapsedSec);
      statusText = `작용 진행 중 (${remain}초 후 도달)`;
    } else if (progress < 2) {
      // 1x ~ 2x: 빨간색 점화 유지 (무음)
      bgColor = 'hsl(0, 84%, 45%)';
      const untilFlash = Math.ceil(timer.durationSec * 2 - elapsedSec);
      statusText = `부작용 관찰 요망 (점멸까지 ${untilFlash}초)`;
    } else {
      // 2x 초과: 강렬한 빨간색 점멸 + 경고음
      bgColor = 'hsl(0, 88%, 46%)';
      isFlashing = true;
      statusText = `🚨 지연 경고! 즉시 병실 확인`;
    }
  }

  return (
    <div
      onClick={onClick}
      style={{ backgroundColor: bgColor }}
      className={`rounded-xl p-3.5 text-white shadow-lg transition-transform duration-150 flex flex-col justify-between min-h-[145px] border border-white/20 ${
        timer ? 'cursor-pointer hover:scale-[1.02]' : ''
      } ${isFlashing ? 'animate-pulse ring-4 ring-red-400' : ''}`}
    >
      <div>
        <div className="flex items-center justify-between">
          <span className="text-lg font-black tracking-tight">
            {bed.room}:{bed.bed}
          </span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/25">
            {bed.gender}/{bed.age}세
          </span>
        </div>
        <div className="text-sm font-bold mt-1 truncate">{bed.patient}</div>
        <div className="text-[11px] text-white/85 truncate">{bed.diagnosis}</div>
      </div>

      <div className="mt-3 pt-2 border-t border-white/20">
        {timer ? (
          <>
            <div className="text-xs font-extrabold truncate">{timer.med.name}</div>
            <div className="text-[11px] font-medium flex items-center gap-1 mt-0.5">
              {isFlashing ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <Clock className="w-3.5 h-3.5 shrink-0" />}
              <span className="truncate">{statusText}</span>
            </div>
          </>
        ) : (
          <div className="text-[11px] text-white/90 font-medium">{statusText}</div>
        )}
      </div>
    </div>
  );
}