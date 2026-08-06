import { describe, expect, it } from "vitest";
import { CombatAnalysisEngine } from "../src/core/analysisEngine";

describe("analysis engine", () => {
  it("companion hasarını owner oyuncuya yazar", () => {
    const engine = new CombatAnalysisEngine();
    engine.ingestLine(
      "26:08:02:22:36:41.9::opop,P[518872298@18657381 opop@test#0001],Drizzt Do'Urden,C[14 Pet_Drizzt],Gzemnid,C[17 Trial_Beholder_Gzemnid],Quick Strike,Pn.Sg02jz,Physical,Critical,500000,600000",
    );
    engine.ingestLine(
      "26:08:02:22:36:42.9::,,Drizzt Do'Urden,C[14 Pet_Drizzt],Gzemnid,C[17 Trial_Beholder_Gzemnid],Quick Strike,Pn.Sg02jz,Physical,Flank,250000,300000",
    );
    engine.ingestLine(
      "26:08:02:22:36:43.9::opop,P[518872298@18657381 opop@test#0001],Drizzt Do'Urden,C[15 Pet_Drizzt],Gzemnid,C[17 Trial_Beholder_Gzemnid],Quick Strike,Pn.Sg02jz,Physical,,100000,120000",
    );
    engine.ingestLine(
      "26:08:02:22:36:44.9::opop,P[518872298@18657381 opop@test#0001],Drizzt Do'Urden,C[16 Entity_Drizzt_Effect],Gzemnid,C[17 Trial_Beholder_Gzemnid],Quick Strike,Pn.Sg02jz,Physical,,50000,60000",
    );
    const snapshot = engine.snapshot("fixture.log");

    expect(snapshot.players).toHaveLength(1);
    expect(snapshot.players[0].name).toBe("opop");
    expect(snapshot.players[0].totalDamage).toBe(900000);
    expect(snapshot.players[0].abilities[0].name).toBe("Quick Strike");
    const splitPets = snapshot.splitEntities.filter(
      (entity) => entity.kind === "pet",
    );
    const splitPet = splitPets[0];
    expect(splitPets).toHaveLength(1);
    expect(splitPet?.ownerName).toBe("opop");
    expect(splitPet?.outgoingDamage).toBe(850000);
    expect(
      snapshot.splitEntities.find((entity) => entity.kind === "player")
        ?.outgoingDamage,
    ).toBe(50000);
    expect(snapshot.entities.find((entity) => entity.kind === "pet")?.outgoingDamage).toBeUndefined();
    expect(snapshot.entities.find((entity) => entity.kind === "player")?.outgoingDamage).toBe(900000);
    expect(snapshot.encounters[0]?.playerDamage[0]?.damage).toBe(900000);
  });

  it("aynı adlı petleri sahip içinde birleştirir, farklı sahipler arasında ayırır", () => {
    const engine = new CombatAnalysisEngine();
    engine.ingestLine(
      "26:08:02:22:36:59.0::Gzemnid,C[17 Trial_Beholder_Gzemnid],,*,Black Death Scorpion,C[10 Pet_Black_Scorpion],Aura Tick,Pn.aura,Physical,,0.02,0.02",
    );
    engine.ingestLine(
      "26:08:02:22:37:00.0::opop,P[1@2 opop@test],Black Death Scorpion,C[10 Pet_Black_Scorpion],Gzemnid,C[17 Trial_Beholder_Gzemnid],Poison Sting,Pn.sting,Poison,,100,100",
    );
    engine.ingestLine(
      "26:08:02:22:37:01.0::opop,P[1@2 opop@test],Black Death Scorpion,C[11 Pet_Black_Scorpion],Gzemnid,C[17 Trial_Beholder_Gzemnid],Poison Sting,Pn.sting,Poison,,200,200",
    );
    engine.ingestLine(
      "26:08:02:22:37:02.0::Other,P[3@4 Other@test],Black Death Scorpion,C[12 Pet_Black_Scorpion],Gzemnid,C[17 Trial_Beholder_Gzemnid],Poison Sting,Pn.sting,Poison,,400,400",
    );

    const pets = engine
      .snapshot("fixture.log")
      .splitEntities.filter((entity) => entity.kind === "pet");

    expect(pets).toHaveLength(2);
    expect(pets.find((pet) => pet.ownerName === "opop")?.outgoingDamage).toBe(300);
    expect(pets.find((pet) => pet.ownerName === "opop")?.incomingDamage).toBe(0.02);
    expect(pets.find((pet) => pet.ownerName === "Other")?.outgoingDamage).toBe(400);
  });

  it("yalnızca Pet_ kaynaklarını companion sayar; oyuncu alanlarını ve binekleri sahibine yazar", () => {
    const engine = new CombatAnalysisEngine();
    engine.ingestLine(
      "26:08:02:22:38:00.0::VULNERE,P[1@2 VULNERE@test],Flame Strike,C[10 Entity_Flamestrike],Gzemnid,C[17 Trial_Beholder_Gzemnid],Flame Strike,Pn.flame,Physical,,100,100",
    );
    engine.ingestLine(
      "26:08:02:22:38:01.0::VULNERE,P[1@2 VULNERE@test],Daunting Light,C[11 Entity_Dauntinglight_Zone],Gzemnid,C[17 Trial_Beholder_Gzemnid],Daunting Light,Pn.light,Physical,,200,200",
    );
    engine.ingestLine(
      "26:08:02:22:38:02.0::VULNERE,P[1@2 VULNERE@test],Snowtusk,C[12 Entity_Mount_M33_Snowtusk_Activepower],Gzemnid,C[17 Trial_Beholder_Gzemnid],Winter's Wrath,Pn.mount,Physical,,300,300",
    );

    const split = engine.snapshot("fixture.log").splitEntities;
    const player = split.find((entity) => entity.kind === "player");
    const detail = player
      ? engine.getEntityDetail("all", true, player.entityId)
      : null;

    expect(split.filter((entity) => entity.kind === "pet")).toHaveLength(0);
    expect(player?.outgoingDamage).toBe(600);
    expect(detail?.outgoingDamagePowers.map((power) => power.name)).toEqual([
      "Winter's Wrath",
      "Daunting Light",
      "Flame Strike",
    ]);
  });

  it("Minor Arm Injury olaylarını analizden tamamen çıkarır", () => {
    const engine = new CombatAnalysisEngine();
    engine.ingestLine(
      "26:08:02:22:39:00.0::opop,P[1@2 opop@test],,*,Gzemnid,C[17 Trial_Beholder_Gzemnid],Oath Strike,Pn.hit,Physical,,100,100",
    );
    engine.ingestLine(
      "26:08:02:22:39:01.0::opop,P[1@2 opop@test],,*,,*,Minor Arm Injury,Pn.Wuki8e1,Physical,,999,999",
    );

    const snapshot = engine.snapshot("fixture.log");
    const player = snapshot.entities.find((entity) => entity.kind === "player");
    const detail = player
      ? engine.getEntityDetail("all", false, player.entityId)
      : null;

    expect(player?.outgoingDamage).toBe(100);
    expect(detail?.outgoingDamagePowers.map((power) => power.name)).toEqual([
      "Oath Strike",
    ]);
    expect(
      snapshot.rawEvents.some(
        (event) => event.abilityName === "Minor Arm Injury",
      ),
    ).toBe(false);
  });

  it("aynı kaynağın aynı görünen güç adını dahili kimliklerden bağımsız birleştirir", () => {
    const engine = new CombatAnalysisEngine();
    engine.ingestLine(
      "26:08:02:22:40:00.0::Tairitsu,P[1@2 Tairitsu@test],,*,Gzemnid,C[17 Trial_Beholder_Gzemnid],Soul Scorch,Pn.first,Physical,,100,100",
    );
    engine.ingestLine(
      "26:08:02:22:40:01.0::Tairitsu,P[1@2 Tairitsu@test],,*,Gzemnid,C[17 Trial_Beholder_Gzemnid],Soul   Scorch,Pn.dot,Physical,Critical,250,250",
    );
    engine.ingestLine(
      "26:08:02:22:40:02.0::Tairitsu,P[1@2 Tairitsu@test],,*,Gzemnid,C[17 Trial_Beholder_Gzemnid],Hadar's Grasp,Pn.initial,Physical,,300,300",
    );
    engine.ingestLine(
      "26:08:02:22:40:03.0::Tairitsu,P[1@2 Tairitsu@test],,*,Gzemnid,C[17 Trial_Beholder_Gzemnid],Hadar's Grasp,Pn.dot,Physical,,400,400",
    );

    const player = engine.snapshot("fixture.log").entities.find(
      (entity) => entity.kind === "player",
    );
    const detail = player
      ? engine.getEntityDetail("all", false, player.entityId)
      : null;

    expect(detail?.outgoingDamagePowers).toHaveLength(2);
    expect(
      detail?.outgoingDamagePowers.find((power) => power.name === "Soul Scorch")
        ?.amount,
    ).toBe(350);
    expect(
      detail?.outgoingDamagePowers.find(
        (power) => power.name === "Hadar's Grasp",
      )?.amount,
    ).toBe(700);
  });

  it("combatDPS, encDPS, incoming, healing, mitigation ve deaths değerlerini ayrı hesaplar", () => {
    const engine = new CombatAnalysisEngine();
    engine.ingestLine(
      "26:08:02:22:00:00.0::opop,P[1@2 opop@test],,*,Gzemnid,C[17 Trial_Beholder_Gzemnid],Oath Strike,Pn.hit,Physical,Critical|Flank,100,80",
    );
    engine.ingestLine(
      "26:08:02:22:00:05.0::opop,P[1@2 opop@test],,*,Gzemnid,C[17 Trial_Beholder_Gzemnid],Oath Strike,Pn.hit,Physical,,100,100",
    );
    engine.ingestLine(
      "26:08:02:22:00:06.0::opop,P[1@2 opop@test],,*,opop,P[1@2 opop@test],Divine Touch,Pn.heal,HitPoints,Critical,-50,-40",
    );
    engine.ingestLine(
      "26:08:02:22:00:07.0::Gzemnid,C[17 Trial_Beholder_Gzemnid],,*,opop,P[1@2 opop@test],Withering Ray,Pn.ray,Shield,,-20,0",
    );
    engine.ingestLine(
      "26:08:02:22:00:08.0::opop,P[1@2 opop@test],,*,,*,Oath Strike,Pn.hit,Power,,-10,0",
    );
    engine.ingestLine(
      "26:08:02:22:00:10.0::Gzemnid,C[17 Trial_Beholder_Gzemnid],,*,opop,P[1@2 opop@test],Withering Ray,Pn.ray,Physical,Kill,30,50",
    );

    const snapshot = engine.snapshot("fixture.log");
    const player = snapshot.entities.find((entity) => entity.kind === "player");
    const boss = snapshot.entities.find(
      (entity) => entity.baseName === "Gzemnid",
    );
    const bossDetail = boss
      ? engine.getEntityDetail("all", false, boss.entityId)
      : null;

    expect(snapshot.activeCombatSeconds).toBe(10);
    expect(player?.activeSeconds).toBe(5);
    expect(player?.combatDps).toBe(40);
    expect(player?.encDps).toBe(20);
    expect(player?.incomingDamage).toBe(30);
    expect(player?.outgoingHealing).toBe(50);
    expect(player?.mitigation).toBe(20);
    expect(player?.actionPoints).toBe(10);
    expect(player?.deaths).toBe(1);
    expect(bossDetail?.outgoingDamagePowers[0].name).toBe("Withering Ray");
    expect(boss?.incomingDamage).toBe(200);
  });

  it("oyuncunun encounter satırını ve zaman damgalı vuruş ayrıntısını döndürür", () => {
    const engine = new CombatAnalysisEngine();
    engine.ingestLine(
      "26:08:02:22:10:00.0::opop,P[1@2 opop@test],,*,Gzemnid,C[17 Trial_Beholder_Gzemnid],Oath Strike,Pn.hit,Physical,Critical,125,100",
    );
    engine.ingestLine(
      "26:08:02:22:10:02.5::opop,P[1@2 opop@test],,*,Gzemnid,C[17 Trial_Beholder_Gzemnid],Divine Judgement,Pn.daily,Physical,Flank,275,250",
    );

    const snapshot = engine.snapshot("fixture.log");
    const player = snapshot.entities.find((entity) => entity.kind === "player");
    const encounter = snapshot.encounters[0]!;
    const detail = player
      ? engine.getEntityDetail(encounter.id, false, player.entityId)
      : null;

    expect(encounter.playerDamage[0].damage).toBe(400);
    expect(detail?.individualOutHits).toHaveLength(2);
    expect(detail?.individualOutHits[0]?.powerName).toBe("Divine Judgement");
    expect((detail?.individualOutHits[0]?.timestamp ?? 0) - encounter.startedAt).toBe(2_500);
  });

  it("uzun analizlerde ilk 250 vuruştan sonrasını drill-down için korur", () => {
    const engine = new CombatAnalysisEngine();
    for (let index = 0; index < 320; index += 1) {
      engine.ingestLine(
        "26:08:02:22:20:00.0::opop,P[1@2 opop@test],,*,Gzemnid,C[17 Trial_Beholder_Gzemnid],Oath Strike,Pn.hit,Physical,,10,10",
      );
    }
    const snapshot = engine.snapshot("fixture.log");
    const player = snapshot.entities.find((entity) => entity.kind === "player");
    const detail = player
      ? engine.getEntityDetail("all", false, player.entityId)
      : null;
    const encounterDetail = player
      ? engine.getEntityDetail(snapshot.encounters[0]!.id, false, player.entityId)
      : null;

    expect(detail?.individualOutHits).toHaveLength(320);
    expect(encounterDetail?.individualOutHits).toHaveLength(320);
  });
});
