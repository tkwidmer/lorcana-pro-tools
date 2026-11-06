# Team prefixes in the Tournament History archive

Source: `tournament_history_standings`, latest `player_name` per `rph_player_id`, 2026-11-06.
17,941 distinct RPH players; 2,266 are RPH-generated placeholders (`Anon-NNN` 1,936, `Adjective_Animal_NNNN` 330) and are excluded, leaving 15,675 named players.

## How tags are written

| Style | Players | Example |
|---|---|---|
| Leading bracket `[TAG] Name` (also `( )`, `{ }`, `《 》`, `【 】`) | 1,016 | `[LF] Alci`, `[EC] Yoh`, `《TDT》Gee` |
| Leading prefix with separator `TAG_Name`, `TAG-Name`, `TAG \| Name`, `TAG ~ Name`, `TAG.Name` | ~2,500 (incl. false positives) | `IINK_Anna`, `ICI-aislia`, `IRN \| Darksteel`, `TB ~ Aiwo`, `GTCG.Aleks` |
| Leading caps word, space only `TAG Name` | ~60 | `THG Figment`, `OTP Mike`, `INP Alex` |
| Trailing tag `Name [TAG]`, `Name (TAG)`, `Name - Team X` | 116 | `Blake [Villain]`, `Jess (ILLUMITREES)`, `TonyV5 - Team Muses` |
| Leading emoji | 150 | `🐀Liryq🐀`, `♾️ Jinzo`, `🌻Lykoss14`, `⚡Inkpactruenada⚡anne`, `🚫🖋️dopa` |

Underscore is by far the most common separator (`TAG_Name`), then `-`, then ` | `. Casing is inconsistent inside one team (`[Hi]`/`[HI]`, `Iconic_`/`ICONIC_`, `BiQ_`/`BIQ_`), and a few teams use two styles (`THG_x` and `THG x`, `[RBT]` and `RBT_`, `[TSD]`/`TSD_`/`TSD x`), so matching has to be case-insensitive and style-agnostic.

## Counts

| Group size (players sharing a tag) | Groups | Players |
|---|---|---|
| 10+ | 109 | 1637 |
| 5–9 | 137 | 918 |
| 3–4 | 95 | 327 |
| 2 | 98 | 196 |

About 341 tags with 3+ players look like real teams, covering roughly 2,882 players (~18% of named players). Two-player tags are a mix of small teams, couples and coincidences.

Caveats: a tag is the literal text, so `[99]` and `[99PL]`, `[LK9]` and `LK9_`, `[INKD]` and `InkD -` may or may not be the same team. Two-letter tags (`[CC]`, `[IO]`, `[GH]`, `TT_`, `MC_`) collide across regions. A player who changed name between events is counted under their latest name only.

## Teams with 10+ players

| Tag | Players | Style | Examples |
|---|---|---|---|
| `LF` | 45 | bracket | [ LF ] W3Duff · [LF]  MateL · [LF] Alci · [LF] Baptiste |
| `EC` | 35 | bracket | [EC] 🌒 Cysu · [EC] Aymx · [EC] Ch'loud · [EC] Foodzaro |
| `RL` | 33 | bracket | [RL] Alê · [RL] Bambamths · [RL] Bia · [RL] Brunita |
| `IINK` | 32 | separator | IINK_aapod · IINK_Anna · IINK_Argyronette · IINK_Aser |
| `IO` | 31 | bracket 23, separator 8 | [IO] Akaba33 · [IO] Bernadette · [IO] BreizRoro · [IO] Dkalko |
| `TB` | 29 | separator | TB ~ Aiwo · TB ~ Anomalie · TB ~ ANTO · TB ~ Atlas |
| `RBT` | 28 | separator 16, bracket 12 | RBT_Belzé · RBT_Comina · RBT_Dougy · RBT_Elhy |
| `LB` | 27 | separator | LB_Aphro · LB_Bigspoon · LB_Dekkerboy · LB_deltamike26 |
| `IKL` | 26 | bracket | [IKL] Belnika · [IKL] Borow · [IKL] Curly · [IKL] DrZaius |
| `RHS` | 24 | separator | RHS_Christian · RHS_Colinaslan · RHS_Danxor · RHS_David |
| `MC` | 22 | separator | MC_akaTJ · mc_bratwurst · MC_Brauerei · MC_Cleopatrick |
| `99` | 21 | bracket | [99] aioly · [99] aredotjayyy · [99] Brianthelionnn · [99] BruhLife |
| `ENC` | 21 | separator | ENC_Benjourno · ENC_Blaze818 · ENC_Brent · ENC_chraaa |
| `TT` | 20 | separator | TT_BarisF2 · TT_CuddlesomeTiger · TT_Doxa · TT_Egelim |
| `EXP` | 19 | bracket 17, separator 2 | [EXP] Bhilou · [EXP] Calim · [EXP] Ezarion · [EXP] Haazeel |
| `LAKE` | 19 | separator | LAKE - Altaris · LAKE_Alazel · LAKE_BB · LAKE_Bolvin |
| `THG` | 19 | separator 10, space 9 | THG_Blinx · THG_CoCo · THG_Doogley · THG_Dwiz19 |
| `TSD` | 19 | separator 15, space 4 | TSD_Aidyn · TSD_Clueless · TSD_cypr · TSD_H-Unit |
| `LBT` | 18 | separator 16, space 2 | LBT_AnaMO · LBT_andrea · LBT_Angi🦄 · LBT_Bobby |
| `TOL` | 18 | separator | TOL_Arn · TOL_Barox · TOL_Bestia · TOL_GBTMP |
| `ICI` | 17 | separator 15, space 2 | ICI - Flopiflopa · ICI-aislia · ICI-AuroreBoreale · ICI-Daftcandy5 |
| `IKO` | 17 | separator | IKO · Bleynkii · IKO · Bleynkii |
| `INKD` | 17 | separator 11, bracket 6 | InkD - Chachaloup · InkD - Cortex ✨ · InkD - Petrus 🍷 · InkD - Reivax |
| `OUD` | 17 | separator | OUD_ARMYesSir · OUD_Asethys · OUD_Clem/Lumi · OUD_Cobalpie |
| `RIP` | 17 | separator 11, bracket 6 | RIP_Bogabo · RIP-dam · RIP-Diablo 72 · RIP-Gargam |
| `CHNORD` | 16 | separator | CHNORD_Anima59150 · CHNORD_Becca · CHNORD_bobo_oh · CHNORD_Corel |
| `ICONIC` | 16 | separator | ICONIC_CINIME · Iconic_ConnerMc23 · Iconic_FarmerBoy · ICONIC_Flügelschlägerin |
| `IM` | 16 | separator 10, bracket 6 | IM_Alcor · IM_Cocai · IM_Dadojacky · IM_Luke95 |
| `LD` | 16 | separator 14, space 2 | LD_Arual · LD_DaniFernandez · LD_Domanke · LD_IcpMara |
| `THM` | 16 | separator 10, bracket 6 | THM · Ju · THM_CaptainBarbeuk · THM_Chenipan_77 |
| `Æ` | 16 | bracket | [Æ] Adamoth · [Æ] BowZerK · [Æ] Doomjohn BzK · [Æ] Enzmae |
| `DARKWINGS` | 15 | separator | DarkWings · Chupa · DarkWings · Corvus |
| `FT20` | 15 | bracket | [FT20] AuntiesQ · [FT20] Austin · [FT20] BigBlake · [FT20] DreambornDanielle |
| `HI` | 15 | bracket | [Hi] Albator · [HI] edoSituation13 🥵 · [Hi] Evazive · [Hi] font font font... |
| `LNT` | 15 | separator | LNT_Carchuler · LNT_CoKeoNe · LNT_Dasein · LNT_Gladyum |
| `LV` | 15 | bracket | [LV] Artemizu · [LV] bahrynowskijakub · [LV] bartoszk · [LV] Bernard |
| `MK` | 15 | separator | MK_Castle · MK_Chicho · MK_Creg · MK_Danny |
| `ONEL` | 15 | separator | OneL_Bicky · OneL_Cremortel · OneL_jeremteach · OneL_JoyBoy |
| `TSR` | 15 | separator | TSR_Andree · TSR_BBop · TSR_BigBaranoia · TSR_Matze |
| `VILLAIN` | 15 | trailing | AprilW [Villain] · AustinG [Villain] · BeinaSLACKER [Villain] · Blake [Villain] |
| `WDL` | 15 | bracket 8, separator 7 | [WDL] AngieHarmonie · [WDL] Indeferdy · [WDL] Majora1 · [WDL] Metallovitch |
| `🐀` | 15 | emoji | 🐀 Aliar 🐀 · 🐀 Muffincia 🐀 · 🐀 Sheitene 🐀 · 🐀 szyymser 🐀 |
| `BTD` | 14 | separator | BTD_Arnold_pe · BTD_Calzius · BTD_ebr88 · BTD_Eolina93 |
| `EMI` | 14 | bracket | [EMI] akko · [EMI] Alpaca🦙 · [EMI] BOUCHACHOSS · [EMI] BOUCHACHOSS 🔥 |
| `HLC` | 14 | separator | HLC_CeeGee · HLC_Green · HLC_ImboSlice · HLC_KIMBO |
| `INKRJ` | 14 | bracket | [INKRJ] · Illuminurso · [INKRJ] Assis Edu · [INKRJ] BigPandaGuy |
| `LE` | 14 | separator | LE_andii · LE_CasheTheFlash · LE_Chefkoch · Le_Coq_Allan |
| `LK9` | 14 | bracket 8, separator 6 | [LK9] Btp · [LK9] Cédric · [LK9] Guicot · [LK9] lesveves |
| `MIP` | 14 | separator | MIP_Dennel · MIP_DomDom · MIP_Dr.Greenthumb301 · MIP_lorcanalena |
| `PYR` | 14 | bracket | [PYR]  Neohi · [PYR] BenJ · [PYR] D@MS · [PYR] DNL |
| `PIMP` | 14 | leading `\| pimp \|` | \| pimp \| Augusto Cheme · \| pimp \| Caio Giovanni |
| `CC` | 13 | bracket 7, separator 6 | [CC] Alastor 🐊 · [CC] Alastor 🐊 · [CC] Aliaboubou 🐊 · [CC] Kwel30🐊 |
| `IBW` | 13 | separator | IBW_Aghar · IBW_Astharoth · IBW_Borchas · IBW_ElDeLaGorra |
| `KDH` | 13 | separator | KdH - ♠️ 8 - REVO · KdH - ♠️Sieben  - Xyerra · KdH - ♣️ 10 - Laude · KdH - ♣️7 - Arco |
| `LFG` | 13 | separator | LFG_4GOTT3N1 · LFG_AndiiMar · LFG_Carsofel · LFG_DannyPhoKing |
| `OL` | 13 | separator | OL_Aarathan · OL_Alfieillumineer · OL_Brighty · OL_Chlo |
| `PD` | 13 | separator | PD_Anika · PD_Bennet · PD_BRANN · PD_DerHut |
| `PRT` | 13 | bracket | [PRT] Arkhamis · [PRT] Bodhy · [PRT] Caly22 · [PRT] Damanna |
| `SNC` | 13 | separator | SnC_Awuillaume · SnC_bH · SnC_Caraxes · SnC_Delta |
| `TINK` | 13 | bracket | [TINK] Albrich · [TINK] Andrea Eme Te · [TINK] ChopSueii · [TINK] Ferran Val |
| `TP` | 13 | separator | TP · goggelz · TP · Jay_ramen |
| `TTS` | 13 | bracket 10, separator 3 | [TTS] Dashew · [TTS] Dim · [TTS] Gaugau380 · [TTS] Gorack (Lorcadier) |
| `TZ3` | 13 | separator | TZ3_Azhag88 · TZ3_Bomber · TZ3_Capra19 · TZ3_Eluccia |
| `UWU` | 13 | separator | UwU_Caduc / Martin · UwU_Chuck Moritz · UwU_Derendus · UwU_Diaflo |
| `BBB` | 12 | separator | BBB_Amano · BBB_Breezy · BBB_Bryniffer · BBB_Camz626 |
| `BLG` | 12 | bracket | [BLG] Andrea · [BLG] Carlish · [BLG] Diego M 🧞 · [BLG] Faqui |
| `GOAT` | 12 | separator | GOAT · Blub · GOAT · Conny |
| `INK` | 12 | separator 9, bracket 3 | Ink _inc Mike · INK_Annie_Girard · INK_Goofy · INK_SebastienP07 |
| `INKA` | 12 | separator | INKA_Andy · INKA_Askidream · INKA_Chaotic_Clown · INKA_ClaireObscur |
| `KSI` | 12 | separator | KSI - Zaickz · KSI · Rica · KSI-Cr0nY |
| `TG` | 12 | separator | TG_ADDUX · Tg_Ale28 · TG_Briciolo · Tg_Davy92 |
| `TLCN` | 12 | bracket | [TLCN] Chuten · [TLCN] Holleb · [TLCN] Karnaud · [TLCN] Outi |
| `TOEP` | 12 | separator | TOEP · Franck · TOEP_Genesix · TOEP_HanHui |
| `WDTA` | 12 | separator | WDTA_Bruti · WDTA_Dark4row.T · WDTA_dePee1996 · WDTA_Guido |
| `BIL` | 11 | separator | BiL · Asgrotan · BiL · Bsching |
| `BRJ` | 11 | separator | BRJ_AleD2 · brj_jejdh · BRJ-AoDCronoS · BRJ-CHAMPION |
| `EQ` | 11 | separator | EQ - Andrés · EQ - Carla 🌷 · EQ - Hextor fire · EQ - Kofy21 |
| `FP` | 11 | separator | FP-BrownFitz · FP-DmT · FP-Madgertha · FP-Motnahp |
| `FPG` | 11 | separator | FPG_Barber · FPG_Broken · FPG_Casemind · FPG_Chilley |
| `FZD` | 11 | bracket | [FZD] Ambush · [FZD] ducardi · [FZD] Frosdra · [FZD] Hayabusa |
| `GG` | 11 | separator | GG_Adriana · GG_andi99 · GG_ElMapache · GG_Lido |
| `IKB` | 11 | bracket | [IKB] Absalom · [IKB] Bisous · [IKB] Blou the gungan · [IKB] DavriX |
| `IOQ` | 11 | bracket | [IoQ] FlyingPizzaDude · [IoQ] Greenis · [IoQ] MickeMozart · [IoQ] Ogge-E |
| `IRN` | 11 | separator | IRN · AndreCruz · IRN · Darksteel |
| `IVKR` | 11 | separator 9, bracket 2 | IVKR_Alice · IVKR_Bebel · IVKR_BubbleMan · IVKR_BubbleWomen |
| `LST` | 11 | separator | LST_Atzepeng · LST_DoitsuKoitsu · LST_Filho · LST_JamieMc |
| `LZK` | 11 | separator | LZK_Chaton · LZK_corb15 · LZK_Irngrim · LZK_kqas |
| `M7` | 11 | bracket 9, separator 2 | [M7] damaneks 🇵🇱 🏔️ · [M7] Emanuel 🇵🇱 🗻 · [M7] Gr4b4rz · [M7] Greyvall |
| `NEX` | 11 | separator | NEX_Absolem · NEX_Bento · NEX_BrandonLnt · NEX_Bucco |
| `OB` | 11 | bracket | [OB] Badnoizes · [OB] Cellendhyll 😈 · [OB] Chee-Hoo · [OB] Deraniel |
| `PJ` | 11 | bracket | [PJ] Esdrubael · [PJ] Gwendoline2928 · [PJ] Korosha · [PJ] Mateo |
| `TEI` | 11 | separator | TEI_ KatieBug28 · TEI_AmyWeekley · TEI_Angry.Duck · TEI_Dan |
| `TGGR` | 11 | separator | TGGR_🅱️ector · TGGR_Ben · TGGR_Eckroth · TGGR_Jahdy |
| `TIC` | 11 | separator | TIC · Cardhunter · TIC · Deathsc0ut |
| `DEGENS` | 10 | separator | DEGENS_Athollord · DEGENS_Brandon · DEGENS_Duffman · DEGENS_Lunar |
| `GBG` | 10 | separator | GBG_BrinkRN85 · GBG_MaFuggin · GBG_MarkE · GBG_Ron |
| `HP` | 10 | separator | HP_Aasaka · HP_Bahason · HP_Erylis · HP_FOXY |
| `IAT` | 10 | bracket | [IAT] Alberic · [IAT] Alexx · [IAT] Borf · [IAT] Crayshi |
| `MAD` | 10 | separator | MAD_Kathrin · MAD_Lift · MAD_LuckyOswald · MAD_Moony 🐶 |
| `MKT` | 10 | separator | MKT_Arctic_Eden · MKT_fabjos · MKT_Fantos · MKT_FlyingSquirrel |
| `NOT` | 10 | separator 7, space 3 | NOT_CHEWBE · NOT_Cleo · NOT_IenaRidens · NOT_Maestro |
| `P626` | 10 | separator | P626_Cris · P626_Fabas · P626_Il tinez · P626_Ilmancios |
| `PT` | 10 | separator | PT_AJ42🚀 · PT_Galaxdriel🚀 · PT_George 🐳 · PT_GuЯu 🚀 |
| `SI` | 10 | separator | SI_Batze · SI_Bazul86 · SI_Eksort · SI_Fidi |
| `TEAM_BADSLIPPER` | 10 | separator | Team_Badslipper_Brian · Team_Badslipper_Daphne · Team_Badslipper_Denni · Team_Badslipper_Joris |
| `TJ` | 10 | separator | TJ_ Chana · TJ_LeAxis · TJ_Padrino🦀 · TJ_PiXeL |
| `ZG` | 10 | separator | ZG_ArYu · ZG_ChiHung · ZG_FaFa · ZG_Fred |
| `ZTL` | 10 | separator | ZTL_Bellerofonte · ZTL_Bibis · ZTL_Enofirg · ZTL_Gattone87 |
| `♾️` | 10 | emoji | ♾️ Eric the Bearded Prince · ♾️ Free win · ♾️ Jinzo · ♾️ ThatMoKid |

## Teams with 5–9 players

| Tag | Players | Style | Examples |
|---|---|---|---|
| `3INK` | 9 | bracket | [3ink] AppleSith · [3ink] AppleSith · [3ink] bdileanis · [3ink] Krezkrieg |
| `ALTAINK` | 9 | bracket | [ALTAINK] Dadipooh · [ALTAINK] Goldberg · [ALTAINK] GreatBibi · [ALTAINK] Hapy |
| `BIQ` | 9 | separator | BiQ_DaMaddin · BiQ_fluffycookie · BiQ_Fly · BiQ_Gork |
| `CCREW` | 9 | bracket | [CCREW]  Cap. Manu Torre🤟🏻 · [CCREW] Álvaro Roca · [CCREW] cazabichosana 🍲🦄 · [CCREW] Delosbrown |
| `CS` | 9 | separator | CS_Aggrivated · CS_Bair · CS_Brad · CS_ChrisMost |
| `DDL` | 9 | separator | DDL_AmauryS7 · DDL_DarkGab257 · DDL_Kleinz · DDL_Makouni |
| `GLIM` | 9 | bracket | [Glim] BBJokeR · [Glim] Biway · [Glim] Crowscabaret · [Glim] Cruellila |
| `ILLUMITREES` | 9 | trailing | Alexander (ILLUMITREES) · Brent to my will (Illumitrees) · Eh Dinge (ILLUMITREES) · Flashy (ILLUMITREES) |
| `INKSHOP` | 9 | bracket | [INKSHOP] Ibai · [INKSHOP] Lore Pirate · [INKSHOP] Megan · [INKSHOP] neurofuzz |
| `LAME` | 9 | separator | LAME_Daad · LAME_elNido · LAME_Ivor · LAME_MartyTheRock |
| `OSA` | 9 | bracket | [OSA] Drago 🇵🇱🏔️ · [OSA] Erlod 🇵🇱🏔️ · [OSA] Gaby · [OSA] helisa |
| `ROV` | 9 | bracket | [ROV] Andy · [ROV] Andy the Grape🍇 · [RoV] BING BONG · [ROV] Jimmy |
| `TL` | 9 | separator | TL · Matthias · TL · mcmike82 |
| `TLS` | 9 | separator 7, bracket 2 | TLS_Astoria_D_Thomas · TLS_Bunnyfreeze · TLS_BunnyWinter · TLS_Cookymonster |
| `TOP` | 9 | separator | ToP-Andrielle · ToP-Axyose · ToP-Chabrone · ToP-Jesupower |
| `$OU` | 8 | bracket | [$OU] Aartka · [$OU] Dinnitz · [$OU] Gus · [$OU] Mr Fredricksen |
| `2319` | 8 | bracket | [2319] Chav · [2319] Glowstar · [2319] Grande_510 · [2319] Moosh47 |
| `ALT` | 8 | separator | ALT · Êiko · ALT · LaValuche |
| `BATTLEBEARS` | 8 | separator | BattleBears · AkatsukiCap · BattleBears · AshaFigaro |
| `DINK` | 8 | separator | DINK_brismith · DINK_Chris · DINK_Ink King · DINK_Jstover42 |
| `GLITCHED` | 8 | bracket | (Glitched)Tron · [Glitched] Kyo46 · [Glitched] NICO · [Glitched] Obsolete |
| `GOTL` | 8 | separator | GOTL_LorkaNils · GOTL_Ludo_Mk · GOTL_Mackenshi · GOTL_MATON |
| `HMG` | 8 | separator | HMG_Dennis · HMG_Derek · HMG_Herman · HMG_JoyBoy |
| `IKS` | 8 | separator 5, space 3 | IKS_CptGab · IKS_DerPzyko J · IKS_Funderburker · IKS_GGPeak |
| `IMO` | 8 | separator | IMO_Dominizi · IMO_DonCarlito · IMO_Fabster · IMO_foron |
| `LC` | 8 | separator | LC ~ Dorrak · LC ~ Illegalplayer😈 · LC ~ Koen · LC_ Marcobroly |
| `LGL` | 8 | separator 6, space 2 | LgL_Djal · Lgl_gael · LGL_Hoshi · LGL_Leradounaud |
| `LK` | 8 | separator | LK_BADXHAND · LK_JonKaos · LK_LorcanaSpinz · LK_MATTERDADDY |
| `MGINK` | 8 | bracket | [MGINK] Buckrocks · [MGINK] Kawaikat · [MGINK] neyla0902! · [MGINK] Noka |
| `MTM` | 8 | separator | MTM_Olkhean · MTM_p2rbls · MTM_Santor · MTM_Toncoiffeur |
| `NG` | 8 | bracket | [NG] Flaxeau · [NG] Hawks · [NG] Naok · [NG] Swandai |
| `OLC` | 8 | separator | Olc _ isa · OLC_Aresius02 · OLC_Aulann · OLC_Jerem |
| `RKS` | 8 | bracket | [RKS] Azrael · [RKS] Guidam · [RKS] Le Rookie · [RKS] Lucas Peyrol |
| `RNC` | 8 | bracket | [RNC] Arba · [RNC] Daypers · [RNC] Mamieours · [RNC] MasterGus |
| `SF` | 8 | separator 5, bracket 3 | SF_Calsinox · SF_ENDER · SF_Sasuken · SF_Strix |
| `TF` | 8 | separator | TF · Auriga · TF · Black Eagle |
| `TFL` | 8 | separator | TFL_Alex · TFL_Derkoch · TFL_DerKochZwei · TFL_Kachy |
| `TMI` | 8 | bracket | [TMI] Encrée · [TMI] Exodor-XIII · [TMI] KenKa · [TMI] Lorekeepler |
| `WLT` | 8 | separator | WLT_Bear · WLT_Cripster20 · WLT_Ginker · WLT_Mery |
| `WTCG` | 8 | bracket | [WTCG] Bison Blanc · [WTCG] FUF · [WTCG] Hextrakt · [WTCG] Okamiyukiii |
| `BDM` | 7 | separator | BDM_Alexios · BDM_Anithrandir · BDM_brumario44 · BDM_Gianmaria28 |
| `BFF` | 7 | trailing | AstralAzur [BFF] · Audestria [BFF] · Benjamin [BFF] · Caillou [BFF] |
| `BKS` | 7 | bracket | [BKS] AntoineM · [BKS] Ciwan · [BKS] Genez · [BKS] Keisa |
| `BNK` | 7 | bracket | [BNK] CinghioCinci · [BNK] D4nk8 🐅 · [BNK] DrNdo · [BNK] Felpato88 |
| `BP` | 7 | separator | BP - Mr Smee · BP_Adonais · BP_Dinu · BP_Stardust |
| `BRICK` | 7 | separator | Brick_around_n_find_out · Brick_DannyDanstar · Brick_JannizZz · Brick_MaxPower |
| `FIRE` | 7 | separator | FIRE_Aldo · FIRE_arcy · FIRE_CatusDC · FIRE_Dalai Marco |
| `GLW` | 7 | separator | GLW_BAP · GLW_Cou · GLW_Ika · GLW_ManolOne |
| `HEKA` | 7 | bracket 4, separator 3 | [HEKA] Alex · [HEKA] Florian · [HEKA] JAX · [HEKA] Morii |
| `HERO` | 7 | bracket | [HERO] DrnkalBychCoco · [HERO] Ilidur · [HERO] Inary · [HERO] Linhartka |
| `IMB` | 7 | separator | IMB_Boltina · IMB_Daneeko · IMB_Joji · IMB_MrPooh |
| `INKCROWS` | 7 | separator | InkCrows · Emberblossom · InkCrows · Lars |
| `INP` | 7 | space | INP Alex · INP AWPuppy · INP Chrismas · INP PartyMarty |
| `LL` | 7 | separator | LL_alexa_zbg · LL_Chackalena · LL_HimbeerKiller · LL_MeepleSchreck |
| `LM` | 7 | separator | LM_ALONS · LM_Anam · LM_Cetreth · LM_MartINK |
| `LORN` | 7 | separator | LorN_Antics · LorN_Belpa · LorN_KevinDL · LorN_LemonsTree |
| `LSA` | 7 | separator | LSA · Geek Inside · LSA · Gertjan B |
| `MHL` | 7 | bracket | [MHL] Coffee · [MHL] Le G · [MHL] Mamzelle_cocotte_ · [MHL] mouffy |
| `MIK` | 7 | separator | MIK_BBowye · MIK_ced_visno · MIK_Kamikuro · MIK_MIKA |
| `OTG` | 7 | bracket | [OTG] Arnaud · [OTG] DDboy · [OTG] kiryu36 · [OTG] le grapin |
| `OTP` | 7 | space | OTP EDWARD · OTP Foolinabox · OTP LifesPuzzle · OTP Mike |
| `PK` | 7 | separator | PK_12thLore · PK_ArbiterandreA · PK_BABYCRUDELIAA🦂🖤🤍 · PK_bookinair1 |
| `RVL` | 7 | separator | RVL_Calle33 · RVL_Cmdr.Laserstrahl · RVL_CoReMi · RVL_Flo |
| `ST` | 7 | separator | ST_AlfredoBirbone · ST_Gabbo95 · ST_Karma00 · ST_Mark93 |
| `TS` | 7 | separator | TS_Alvaro 🫟 · TS_Antonella 🫟 · TS_Dani11 · TS_Falconeti🫟 |
| `TU` | 7 | bracket | [TU] BenD.Vinci · [TU] Dairino · [TU] Don-Shimon · [TU] Hofnarr |
| `WG` | 7 | separator | WG_AJK · WG_Ar Nic · WG_BobbyLoveElsa · WG_Charis |
| `ZTH` | 7 | bracket | [ZTH] Eelvee · [ZTH] Gagalaxy · [ZTH] Jul-E · [ZTH] Kial |
| `🌻` | 7 | emoji | 🌻 James Gray II · 🌻Brohammington · 🌻GabeGolfer · 🌻Lykoss14 |
| `1+1` | 6 | bracket | [1+1] Fred · [1+1]-Capsarie · [1+1]-Cha · [1+1]-Nilrouge |
| `4GOT` | 6 | bracket | [4GOT]LetsGoSki · [4GOT]mevin · [4GOT]Pakkia89 · [4GOT]Riky27 |
| `BJK` | 6 | bracket | [BJK] Dragg · [BJK] Faulk13 · [BJK] Hebisuka · [BJK] Jones |
| `COI` | 6 | separator | COI · duesentrieb · COI · Granic |
| `DD` | 6 | separator | DD_Adrián C. · DD_EzioMaya · DD_Hydro · DD_JaviRM11 |
| `ESTA` | 6 | separator | ESTA_Dreaddy_974 · ESTA_Elegna · ESTA_Matt_DK · ESTA_Shadou |
| `GH` | 6 | bracket | [GH] Hoplit · [GH] JM · [GH] Krytton · [GH] Kubqo |
| `GPL` | 6 | bracket | [GPL] Crusty 🇵🇱 🏔️ · [GPL] EvilBunny 🇵🇱🏔️ · [GPL] GRUWSKI · [GPL] J4kubb 🇵🇱 🏔️ |
| `IKT` | 6 | separator | IKT_Ghiotto86 · IKT_GianlucaR · IKT_Inkegno · IKT_Link185 |
| `IMG` | 6 | separator | IMG_Angelblanco2 · IMG_Carles · IMG_Davidmf55 · IMG_Indis |
| `IR` | 6 | separator | IR_fiend · IR_Figment · IR_FwiZzii · IR_JonnyBoy |
| `JFT` | 6 | separator | JFT_ Genny D Sauro · JFT_Ar3s_94 · JFT_Beatrix · JFT_Gabriel679 |
| `LAG` | 6 | separator | LAG_Albius · LAG_Aleksi · LAG_Captain-SaraZin · LAG_Nyshae |
| `LBC` | 6 | bracket | [LBC] Dedogawa · [LBC] Geo · [LBC] Klelyah · [LBC] Marichat |
| `LCFT` | 6 | bracket | [LCFT] Daokwan · [LCFT] Guizmo · [LCFT] Mega_Duck · [LCFT] MisterJordy |
| `LRD` | 6 | bracket | [LRD] AlexisMoc · [LRD] Bahdin · [LRD] Leink · [LRD] LorcaDlp |
| `MAGMA` | 6 | bracket | [magma] barruda · [magma] barruda · [Magma] Bosca · [Magma] Hanna |
| `META` | 6 | bracket | [Meta] - Mathieu · [META] Bobstache · [META] Capitaine Line · [META] ClaraEvenstar |
| `MH` | 6 | bracket | [MH] AlbiePort · [MH] Byron · [MH] Cubby · [MH] melaj |
| `MI` | 6 | separator 4, bracket 2 | MI · Dustin · MI · Mantelrog |
| `OFA` | 6 | separator | OFA · Aimilia · OFA · Chlohi |
| `P&A` | 6 | separator | P&A_ B100 · P&A_Jan · P&A_Michael · P&A_Michiel |
| `RD` | 6 | space | RD Carballo · RD Cowboy Tipo🐮 · RD Javi A · RD Joanitalulu |
| `RNK` | 6 | separator | RnK_Damatoa · RnK_DonKrys76 · RnK_Ino · RnK_Lexou |
| `RTG` | 6 | separator | RTG_Cri-Kee · RTG_fidget · RTG_Harlock · RTG_Mushu |
| `TCB` | 6 | separator | TCB · JohnnyBravo · TCB · Kin Wang |
| `TDM` | 6 | separator 4, bracket 2 | TDM_CaptainTSR · TDM_JustFlow · TDM_Pat18 · TDM_Tatlju |
| `TDT` | 6 | bracket | 《TDT》 CookieChief · 《TDT》Aibala · 《TDT》BigBroBert · 《TDT》E-Rod |
| `TEAM OLYMPUS` | 6 | trailing | ☀️Apollo☀️ - Team Olympus · ⚔️  Ares  ⚔️  - Team Olympus · ⚡️Zeus⚡️ - Team Olympus · 👷🏻‍Hephaestus - Team Olympus |
| `THLUP` | 6 | separator | THLUP_Chesterr37 · THLUP_Duche · THLUP_ElPrincipe22 · THLUP_KebabbaroMan |
| `TLD` | 6 | separator | TLD_Grootus · TLD_Harold · TLD_NeverBored · TLD_Smillie 😊 |
| `TNP` | 6 | separator | TNP_ArthurP · TNP_ChaosAJ · TNP_Lego · TNP_Medievh |
| `TNT` | 6 | separator | TNT_CasiY · TNT_Katikato · TNT_Lenandros · TNT_LilSaint |
| `TPM` | 6 | separator | TPM_Colin · TPM_james🐉 · TPM_KELEIGH · TPM_Ryan |
| `TZ` | 6 | bracket | [TZ] Gab Soares · [TZ] Lari Rosa · [TZ] Maju Souza · [TZ] Renan Reis |
| `UNK` | 6 | separator | UNK_DrInvsble · UNK_Frogmite · UNK_Roderick · UNK_SherLocked |
| `UTOPIA` | 6 | bracket | [UTOPIA] Courtis · [UTOPIA] JustMax · [UTOPIA] Kaarya · [Utopia] Max |
| `WRD` | 6 | bracket | [WRD] Catane · [WRD] Eawane · [WRD] FreddyMelcurry · [WRD] Gedeon Platypus |
| `ZFG` | 6 | separator | ZFG_Agus🎲🍀 · ZFG_Angeluqui622 · ZFG_CarolxP · ZFG_Ebbrei |
| `🌊` | 6 | emoji | 🌊 [IW] Matt 🌊 · 🌊 [IW] Riatna 🌊 · 🌊 [IW] Slydenfox 🌊 · 🌊 [IW] Smilecaro 🌊 |
| `AWNM` | 5 | separator | AWNM_Julian.S · AWNM_Ruud · AWNM_Stephanie · AWNM_Wesley |
| `B3T` | 5 | separator | B3T_Adkadi · B3T_Alqui · B3T_Cuchillo McCapri · B3T_DavidDAVE |
| `BB` | 5 | separator | BB_Biondo96 · BB_Lollocast · BB_Manfro · BB_pedrante |
| `BDL` | 5 | separator | BDL - Frizouille · BDL - GrumpyDam · BDL - Julie Mélomane aigüe · BDL - MattSparrow |
| `BRXL` | 5 | separator | BRXL_Ceccop · BRXL_Ellipanda · BRXL_enricopelo · BRXL_JMorrison |
| `CAPIVALORE` | 5 | bracket | [CapivaLore] baN · [CapivaLore] Jobim · [CapivaLore] Lord Kaio · [CapivaLore] magRen |
| `CLE` | 5 | separator | CLE - Karnage · CLE_BoatSnack · Cle_GriffyJ · CLE_Mondy |
| `GTCG` | 5 | separator | GTCG.Aleks · GTCG.Bardacado · GTCG.BAZONGKI · GTCG.Samgyupsal |
| `HL` | 5 | space 3, separator 2 | HL Chhunbucket · HL Desante · HL McScoops · HL_eRaycer |
| `HSC` | 5 | space | HSC Bjorn Gave Me His Foils · HSC Elise · HSC Shibby ☠️ · HSC TeemoEnjoyer |
| `IF` | 5 | bracket | [IF] ALLP1635 · [IF] Bonefolder · [IF] Ziggy · [IF]KnightA |
| `ILM` | 5 | separator | ILM_Bonkers · ILM_Cocobalt · ILM_FoMD · ILM_kikoff |
| `INKR` | 5 | bracket | [INKR]Balma · [INKR]Choupy · [INKR]Khalimdar · [INKR]Mijole |
| `KKP` | 5 | separator | KKP_BabaYaga · KKP_MrBomb · KKP_RaZeRPaT · KKP_Sternhai |
| `LD1` | 5 | separator | LD1_ANVILDEVIL · LD1_Fryze998 · LD1_Grandepuffo65 · LD1_MACS |
| `NLO` | 5 | separator | nLo - HausenDan · nLo - Jeremy Walker · nLo- Pancho Romero · nlo-Jinx Shame |
| `NVR` | 5 | separator | Nvr · NvrGunnaStop(Mark) · NVR_44lvarado · NVR_AlphaJBO |
| `PB` | 5 | separator | PB_Bellalv · PB_Rorxs · PB_Samai · PB_SANS_BRG |
| `RDP` | 5 | separator | RdP_$crooge · RdP_Ashley · RdP_Danner · RdP_Seomann |
| `RFT` | 5 | separator | RFT_Blitz · RFT_Haviix · RFT_Huayra · RFT_Link |
| `SB` | 5 | separator | SB_Lexaluxis · SB_Morcana · sb_peitsche · SB_Volkmar |
| `SNS` | 5 | bracket | [SnS] Johrel · [SnS] KingKang · [SnS] momotaro · [SnS] muu |
| `SPX` | 5 | separator | SPX · flyingphoenix · SPX · Ice Sorcerer |
| `TEAM MUSES` | 5 | trailing | Ashley M - Team Muses · Brandon Richards - Team Muses · Brandon Richards - Team Muses · Brittany Robertson-Team Muses |
| `TEAMKA` | 5 | separator | TeamKA.BKM.PuffBite · TeamKA.ICON.FishGod · TeamKA.QUEST·倾人城 · TeamKA.TopDeck |
| `TGN` | 5 | bracket | [TGN] Capt_C4RN4GE · [TGN] DOMCRIT · [TGN] KazNatBabs · [TGN] Riceman |
| `VGL` | 5 | separator | VGL_albamustaine · VGL_Arepiita · VGL_Criz · VGL_Darius |
| `WNK` | 5 | separator | WnK_Damanubis · WnK_Ketchup · WnK_Mhaaze · WnK_Onyht |

## Teams with 3–4 players

| Tag | Players | Style | Examples |
|---|---|---|---|
| `ATTQ` | 4 | bracket | [ATTQ] Geezy · [ATTQ] KingKwong · [ATTQ] Solomungrundy · [ATTQ] Wahkeen |
| `AVJ` | 4 | bracket | [AvJ] Flo86 · [AvJ] Jeh · [AvJ] Juju · [AvJ] RinZleR |
| `CG` | 4 | bracket | [CG] Annilatac · [CG] Mackroz · [CG]BaconStripsCL · [CG]Jackpot |
| `CMI` | 4 | bracket | [CMI] Crazylegzs · [CMI] Feeahlix · [CMI] Tarzan77 · [CMI] trllvll |
| `EDA` | 4 | bracket 2, separator 2 | [EDA] Evomimi · [EDA] Hardkil · EDA-EroSenin · EDA-SPARDA |
| `EMP` | 4 | separator | EMP_Chapuzas · EMP_EliSeven · EMP_Neo · EMP_onlybyalba |
| `ETB` | 4 | space | ETB Adrian · ETB Games Nick · ETB Kris · ETB Riley |
| `FBS` | 4 | bracket 2, separator 2 | [FBS] Bentbranch · [FBS] Wreck It Rob · FBS · Fenix |
| `FL` | 4 | separator | FL-Damon · FL-Rocky · FL-rui · FL-Yuffie |
| `FTL` | 4 | separator | FTL - Morthemer · FTL-Dyzoo · FTL-Magnas · FTL-Revih |
| `GCF` | 4 | separator | GCF _ Marjo · GCF_Adwon · GCF_Aenarian · GCF_Foxy |
| `HS` | 4 | bracket | [HS] CINDER · [HS] Magicarpaccio · [HS] YoDa · [HS]Mjoolnir |
| `IAB` | 4 | bracket | [IAB]  Manu 🪐 · [IAB] 6d2 🧨 · [IAB] Dudels · [IAB] Norii08 🌟 |
| `ICW` | 4 | space | ICW Mascarale · ICW Miss Shiny ✨ · ICW PulsoD · ICW Silthrim95 |
| `IDK` | 4 | bracket | [IDK] Hitorit 🇵🇱🏔 · [IDK] simograj 🇵🇱🏔️ · [IDK] timhalf · [IDK] Yao |
| `IHT` | 4 | separator | IHT_AleMangiu · IHT_Alessandro Danesi · IHT_Michele_Carretta · IHT_Pivox |
| `IMP` | 4 | separator | IMP - Smpcavery · IMP_AllesDrinAusserWin · IMP_Kyoshi · IMP_VelvetMamba |
| `INK PASS` | 4 | bracket | [Ink Pass] Daniel T · [Ink Pass] iVSlime · [Ink Pass] Lawcana · [Ink Pass] LegendGary |
| `INKS` | 4 | separator | INKS_Bunnypun · INKS_Der_Vierte_Hokage · INKS_LaikaS · INKS_THOENNESSTEIN |
| `IQ` | 4 | bracket | [IQ] AxisLouie · [IQ] Darkmouse21 · [IQ]Daniel Reid · [IQ]Herbs |
| `KNY` | 4 | bracket | [KNY] Canaillou 🐥 · [KNY] FGMarius 🐥 · [KNY] Margotine 🐥 · [KNY] Seyfert |
| `KONG` | 4 | separator | KONG_Breegos · KONG_Fulci · KONG_indeciso · KONG_vecchialarm |
| `LIK` | 4 | separator | LiK_Little · Lik_Qu3lQu1 · LiK_Shin · LiK_Snowletz |
| `LOL` | 4 | separator | LoL_KatCrits · LoL_Kazii · LoL_RascalAddams · LoL_ScroogeTheRulez |
| `LOTL` | 4 | separator | LOTL_Brakandaran · LOTL_NicRone · LOTL_sKleene · LOTL_Vereck92 |
| `ML` | 4 | separator | ML_Bombocards · ML_Irenecus · ML_Morientes · ML_TaiyoNoKoori |
| `MMC` | 4 | bracket | [MMC] Azura · [MMC] Azura · [MMC] La Melio · [MMC] xavounette |
| `NZK` | 4 | separator | NZK_Angel alvarez · NZK_Lucena · NZK_SirTorne · NZK_Wirry |
| `OZM` | 4 | separator | OZM_Elbobicar · OZM_Elpiks · OZM_Thalos · OZM_Throkx |
| `PYFS` | 4 | separator | PYFS_ItsMeJay · PYFS_Lumen · PYFS_MCHammer · PYFS_UnQuackAbleWill |
| `RR` | 4 | separator | RR_Latzenaugust · RR_Reyem · RR_SlavicBOYYY · RR_Vhaleru |
| `RSR` | 4 | separator | RSR - DisneyDreamer · RSR - Ferkalicious · RSR - Kingsbury · RSR-GGoliath |
| `SGS` | 4 | separator | SGS_Bigdogbourne · SGS_ETHAN P · SGS_Lecky · SGS_NICO |
| `SM` | 4 | separator | SM_Guido · SM_J · SM_Luke · SM_Timo |
| `TEAMBROKE` | 4 | trailing | 🦈Kenny c. 《 TeamBroke 》 · Deirdree🌹《TeamBroke》 · Nikazzz  🍀《TeamBroke 》 · Tom Shō《TeamBroke》 |
| `TEAMDEVYLDER` | 4 | separator | TeamDeVylder_Bianca · TeamDeVylder_Esther · TeamDeVylder_Geert · TeamDeVylder_Nathan |
| `TST` | 4 | bracket | [TST] FrancescoTottiBiascica · [TST] Nico · [TST]Alessio Di Lorenzo · [TST]CostaBabyBoy |
| `URI` | 4 | bracket | [Uri] DarlaLH · [Uri] WinstonDH · [Uri]Sarielle · [Uri]Zappy |
| `UTS` | 4 | bracket | [UTS] 🚀SpaceRanger 🌊 · [UTS] Drien71 · [UTS] Sauleane 🌊 · [UTS]🐒TiltMonkey🌊 |
| `ZZZ` | 4 | bracket | (ZzZ) black sun zenith · (ZzZ) Sunshine · (ZzZ)Engelous · (ZzZ)Snoracana_Gary |
| `⚡` | 4 | emoji | ⚡Inkpactruenada⚡anne · ⚡Inkpactruenada⚡Kiddo91 · ⚡Inkpactruenada⚡nuriacp · ⚡Inkpactruenada⚡wicca |
| `🚫🖋️` | 4 | emoji | 🚫🖋️ JCho · 🚫🖋️Briguy · 🚫🖋️dopa · 🚫🖋️Q |
| `007` | 3 | separator | 007_Bisca · 007_Nbrio4🧪 · 007_Yrian92 |
| `BM` | 3 | separator | BM-ChrisCaptain · BM-Squall · BM-Weib |
| `BS` | 3 | bracket | [BS] Hextra · [BS] JustFindus · [BS] Kwaif |
| `CBG` | 3 | bracket | [CBG] Edwin · [CBG] Hangry Illumineer · [CBG] Im_the_problem |
| `DRGN` | 3 | separator | DRGN_LiamR · DRGN_Sleepybrownzzz · DRGN_Treeknocker |
| `ENV` | 3 | trailing | AWholeNewQuest [ENV] · Incubus828 [ENV] · VillainArc [ENV] |
| `FDAB` | 3 | separator | FDAB_IsraelPR · FDAB_Jaescry · FDAB_Mario Saruman |
| `FUN` | 3 | separator | FUN · Catwington · FUN · ruciane |
| `GLI INKREDIBILI TEAM` | 3 | trailing | Gabpass (Gli Inkredibili Team) · Marsili (Gli Inkredibili Team) · Mica (Gli Inkredibili Team) |
| `GRD` | 3 | bracket | [GRD] Alex · [GRD] Hestileos · [GRD] Hoto |
| `HOTC` | 3 | separator | HOTC_AnngelBomb · HOTC_GGFate · HOTC_Matp05 |
| `ID` | 3 | separator | ID · RavenAnxy · ID · Snowstorm |
| `INK45` | 3 | separator | Ink45_Ecko · Ink45_Patze · Ink45_Timo214 |
| `INKCSTR` | 3 | separator | INKCSTR_Albert · INKCSTR_JReyes · INKCSTR_NixonC |
| `INKREDIBLES` | 3 | trailing | Laura Ryan (Inkredibles) · Mdskeeper (Inkredibles) · Salabama724 (Inkredibles) |
| `KEEP7` | 3 | separator | Keep7_Ben · Keep7_Meltiac · Keep7_Strahlemann0815 |
| `LCI` | 3 | separator | LCI_Danny · LCI_Geert · LCI_Zai |
| `LDSF` | 3 | separator | LDSF_Jerem · LDSF_Ptitbiscuits · LDSF_Vixdenice |
| `LEGENDARYS` | 3 | separator | Legendarys_eca999 · Legendarys_Erik perez · Legendarys_Ismael Pérez |
| `LTD` | 3 | separator | LTD_Kreepo · LTD_Kreepo · LTD_Yilmaz |
| `LUCHALORES` | 3 | separator | LuchaLores_Adam · LuchaLores_NotVicki · LuchaLores_Skyguy |
| `MA` | 3 | bracket | [MA] Dioneso · [MA] Eko · [MA] manuSDF |
| `MGG` | 3 | separator | MGG · ruFFy · MGG · Severin |
| `MGL` | 3 | space | MGL Ares · MGL Daneal · MGL Ukiyo |
| `MHM` | 3 | bracket | (MHM) KK · (MHM) Svking · [MHM] TAOxEaglex |
| `MKB` | 3 | separator | MKB_ben · MKB_Revan · MKB_Tom |
| `MQ` | 3 | separator | MQ_Bjoern · MQ_Simone · MQ_ZiegenBock |
| `MXR` | 3 | separator | MXR_Jazib/Davy · MXR_Nety · MXR_Oggar |
| `NAGA` | 3 | bracket | [NAGA] Ashball · [NAGA] Shâmundâ · [NAGA] Xenomax |
| `NLGD` | 3 | separator | NLGD_AK_Mario · NLGD_Baker · NLGD_DAVS53 |
| `NTCG` | 3 | separator | NTCG_Demien · NTCG_Fredy · NTCG_Lynna |
| `OD` | 3 | bracket | [OD] BlackNox 🐙 · [OD] Brindacier · [OD] Mimi 🐙 |
| `OPL` | 3 | bracket | [OPL] MaryMaryline · [OPL] Saikane · [OPL] Spoutnik |
| `POTATO` | 3 | bracket | [POTATO] @marcos_lorcana · [POTATO] Elenafg · [POTATO] The Loot Lair -Martin |
| `PPL` | 3 | separator | PPL - Manely67 · PPL-Atsio · PPL-Kssksss67 |
| `QDIT` | 3 | separator | QDIT_Krapfen9 · QDIT_SissrhEl · QDIT_SissrhEl |
| `QIP` | 3 | separator | QiP_Euro9000 · QiP_Madara · QiP_Nephentes |
| `RESERVA` | 3 | bracket | [Reserva] Cleber · [Reserva] Murilanches · [Reserva]Rafael |
| `RSG` | 3 | space | RSG Anatidae · RSG Chilla · RSG Free |
| `RTB` | 3 | separator | RtB_Bommel · RtB_Knappe · RtB_Yixx |
| `SADDOG` | 3 | separator | SadDog_Franklin · Saddog_Soulman2166 · SadDog_Wesley |
| `SPRK` | 3 | separator | SPRK_Biffi · SPRK_Kimeira · SPRK_Xelta |
| `TAL` | 3 | separator | TaL_CiaoKakao · TaL_helios42u · TaL_Sonarya |
| `TEAM PERFECT CURVE` | 3 | trailing | fradotato (Team Perfect Curve) · HybridLP08 (Team Perfect Curve) · It’sBrittanyBetch (Team Perfect Curve) |
| `TEAMGF` | 3 | bracket | [TeamGF]-Ivy · [TeamGF]-LorKhan · [TeamGF]-Lyserg |
| `TGUY` | 3 | separator | TGuy_cesu · TGuy_itsroserade · TGuy_KingJ |
| `TMSP` | 3 | trailing | BreM8 (TMSP) · Hoodworks (TMSP) · JGSali (TMSP) |
| `TSP` | 3 | bracket | [TSP] Healion · [TSP] misbounce · [TSP] Vermillion |
| `TTH` | 3 | separator | TTH · Cerriegold · TTH · crazyetwas |
| `TXC` | 3 | separator | TXC_Borjon · TXC_Lukiluki · TXC_Squirtle |
| `VCP` | 3 | separator | VCP_FabioTon · VCP_Mish · VCP_Nickbeast95🦁 |
| `WCC` | 3 | separator | WCC_DanieleMatrigale · WCC_JustinM · WCC_Logan |
| `👑` | 3 | bracket | [👑] Brendo Ikeda · [👑] Jose Tavares · [👑] Rubens Netto |

## Pairs (2 players)

| Tag | Players | Style | Examples |
|---|---|---|---|
| `03C` | 2 | bracket | [03C] ageNDuck · [03C] B.Yeo |
| `60MB` | 2 | separator | 60MB_Ele · 60MB_Ironbalden |
| `99PL` | 2 | bracket | [99PL] Inkchantress · [99PL]Yoshipked |
| `AD-S` | 2 | bracket | [AD-S] Steevounet · [AD-S]Romainpsj |
| `ADAM` | 2 | separator | Adam - HHM 🐓 · Adam_12thLore |
| `AKOM` | 2 | bracket | [AKoM]Brikala · [AKoM]Kittytheshinigamy42 |
| `AOG` | 2 | separator | AOG_Enforcer201 · AOG_Mochi |
| `ART` | 2 | bracket | [ART] BlueEars626 · [ART] Jayrems |
| `ATS` | 2 | bracket | [ATS] Bia branco · [ATS] MrObscure |
| `BA` | 2 | separator | BA_lorcana_opa · BA_wolfgang |
| `BIG` | 2 | separator | Big_King_Papa · Big_Neck_ giraffe |
| `CARDCROWS` | 2 | separator | CardCrows · Ronny · CardCrows · Sascha |
| `CHRISTIAN` | 2 | separator | Christian_J · Christian_R |
| `DANIEL` | 2 | separator | Daniel_W · Daniel-Lewis |
| `DANNY` | 2 | separator | Danny_MP · Danny_oh |
| `DCL` | 2 | separator | DCL-B&A · DCL-B&A |
| `DJ` | 2 | space | DJ Bex · DJ Heim |
| `DRL` | 2 | separator | DRL_clodda89 · DRL_Marcoval90 |
| `DSL` | 2 | separator | DSL_Denis · DSL_Roxez |
| `DT` | 2 | separator | DT_Noelia · DT_Rodrigo |
| `DYXONIAN` | 2 | separator | Dyxonian_INKINC · Dyxonian_INKINC |
| `ECC` | 2 | separator | ECC_Frdrake · ECC-Mark |
| `EI` | 2 | separator | EI · ElChato · EI · Xyj |
| `EL2` | 2 | separator | EL2_CarlesAFK · EL2_Saraa |
| `ELJ` | 2 | separator | ELJ_Alex · ELJ_Ghartuck |
| `EX` | 2 | bracket | [EX] Figure · [EX] Wodnik |
| `EXILED` | 2 | bracket | [Exiled] JLlera · [Exiled] Marta G.H. |
| `FAMILYQUESTS` | 2 | separator | FamilyQuests-Daniel · FamilyQuests-Lily |
| `FCM` | 2 | separator | FCM- HadesBrut-SilverRay · FCM-HadesBrut-StepHahn |
| `FDL` | 2 | separator | FDL - Kiwitch · FDL-Yoks |
| `FF` | 2 | bracket | [FF]Rainbowsky · [FF]Tomate_Detective |
| `FG` | 2 | bracket | [FG] NaroSniper · [FG] Rocielle |
| `FLO` | 2 | separator | flo_the_pingu · Flo.CD |
| `FRITE` | 2 | separator | FRITE-Algérienne · FRITE-Ketchup |
| `GI` | 2 | separator | GI-Keellath · GI-Pepperjack McKringgleberry |
| `GIL` | 2 | separator | Gil_M · Gil-Galad24 |
| `IKG` | 2 | bracket | [IKG] VuDude · [IKG] Young2064 |
| `INKOGNITO` | 2 | separator | Inkognito_DGatsby · Inkognito_najie |
| `ISAAC` | 2 | separator | Isaac_OOO · Isaac-Urza |
| `ITI` | 2 | separator | ItI_Overlook · ItI_Sawyer |
| `JAVI` | 2 | separator | Javi_ink · Javi-OTC |
| `JAZZ` | 2 | separator | Jazz-Vador · jazz.canop |
| `JO` | 2 | separator | Jo-El · Jo-One |
| `JUST` | 2 | separator | just_alan91 · just_op |
| `KE` | 2 | separator | KE_Jan · KE_Moritz |
| `KLK` | 2 | separator | KLK_Kriou · KLK_Silivyas |
| `KOSTKA` | 2 | bracket | [KOSTKA] clapka_p · [KOSTKA] Visargy |
| `LBK` | 2 | space | LBK JahirS🥶 · LBK NicoBzn🫔 |
| `LCC` | 2 | space | LCC Alex Heng · LCC DK |
| `LCN` | 2 | separator | lcn_muffin · LCN_UniSushi |
| `LDL` | 2 | separator | LDL_DeboraAlbaina · LDL_DiegoMartinez |
| `LH` | 2 | bracket | [LH] JustinCapable · [LH] Uncool Sam 🔥 |
| `LN` | 2 | separator | LN_Calmo · LN_Pingu |
| `LT41` | 2 | bracket | [LT41] Bazafrog · [LT41] DarkGobl1n |
| `MAADD` | 2 | separator | MAADD_Dedawiz · MAADD- L'ipnorospo🐸 |
| `MATT` | 2 | separator | Matt - (Matthias) · Matt_A |
| `MDG` | 2 | separator | MDG_Dante The Pizzafan · MDG_Dreamer Lore |
| `MHL🐦‍⬛` | 2 | bracket | [MHL🐦‍⬛]  Tene · [MHL🐦‍⬛] Artichaud |
| `MLK` | 2 | bracket | [MLK] Alejandruca 💖 · [MLK] Vankyr |
| `MOHS` | 2 | bracket | [MOHS] Fogz · [MOHS] Neoraiden |
| `MRS` | 2 | separator | Mrs. Villainous [ENV] · Mrs.Dreamborn |
| `MULL` | 2 | separator | MULL_Inkpeet · MULL_Janosch39 |
| `NO` | 2 | separator | no_its_becky_ · No.One_Boofasa |
| `OOO` | 2 | separator | oOo - Maestro · oOo - Never★Lucky |
| `PCC` | 2 | separator | PCC_BlazingPiccia · PCC_Tweeco |
| `POP` | 2 | bracket | [PoP] Charl · [PoP] Lyrakish |
| `PPRO` | 2 | separator | PPRO_Noel · PPRO_queesin |
| `PROF` | 2 | separator | Prof. 101 · Prof. MaxChamb |
| `PSG` | 2 | separator | PSG - SirLore · PSG-Lucas |
| `Q2W` | 2 | bracket | [Q2W] JajoKlek · [Q2w] Pokes 🔛🔝🔜 |
| `QUESTLORE` | 2 | separator | QuestLore - Matt · QuestLore - Thing 1 |
| `RAFIKI` | 2 | separator | Rafiki_Kawaï · Rafiki_Kawaï |
| `RDS` | 2 | bracket | [RDS] Into The Light · [RDS] Perceval |
| `REF` | 2 | bracket | [REF] Baguich · [REF] Lhurgo |
| `RFL` | 2 | bracket | [RFL] - Krhalim (Fifi) · [RFL] Oui_Ouaf (Loulou) |
| `ROYAL` | 2 | separator | ROYAL - JessiG5 · ROYAL-Ghost |
| `S11` | 2 | separator | S11_Nico · S11_TruePika |
| `SCAM` | 2 | separator | SCAM_Gatto · SCAM_Mostarda |
| `SHIFT` | 2 | space | SHIFT HAPPENS! (ILLUMITREES) · SHIFT TheArchlord |
| `SRC` | 2 | trailing | Alexa[SRC] · Diabeto88[SRC] |
| `STEF` | 2 | separator | Stef_jac · Stef.D |
| `T61` | 2 | bracket | [T61] Majkel · [T61] Panda |
| `TCG` | 2 | separator | TCG_Kyle · TCG_Thesaurus |
| `TCR` | 2 | separator | TCR_Auslenderman · TCR_endyucation |
| `TDLC` | 2 | separator | TDLC_Clive · TDLC_MicC25 |
| `TIL` | 2 | separator | TIL-Lady Panno · TIL-Panno |
| `TK` | 2 | separator | TK - Vaasbrause · TK - Xabbu |
| `TM4` | 2 | separator | TM4_Melo · TM4_Rob |
| `TMB` | 2 | separator | TMB_Fatabik · TMB_Ravioli89 |
| `TRP` | 2 | separator | TRP • Corgi Malicieux · TRP • TFKC |
| `TSDXINK` | 2 | separator | TSDxINK_HurricaneDave · TSDxINK_Keesee |
| `TSI` | 2 | separator | TSI_Itah · TSI-SnK |
| `TW` | 2 | separator | TW_Maddin · TW_Maddin |
| `UCP` | 2 | separator | UCP · Laura · UCP · Wouter |
| `WPF` | 2 | separator | WPF_Cookie91 · WPF_NinaZarg |
| `WYLD` | 2 | space | WYLD Awesomenerddad · WYLD Zurita |
| `❤️ KART` | 2 | bracket | [❤️ kart] 🐯 DonTigh 🐯 · [❤️ kart] Nieaneta |
| `💪🦈` | 2 | emoji | 💪🦈 Acevd93 · 💪🦈Capibaradude |
