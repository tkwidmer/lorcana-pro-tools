# Team prefixes in the Tournament History archive

Source: `tournament_history_standings`, latest `player_name` per `rph_player_id`, 2026-11-06.
17,941 distinct RPH players; 2,266 are RPH-generated placeholders (`Anon-NNN` 1,936, `Adjective_Animal_NNNN` 330) and are excluded, leaving 15,675 named players.
The same data as a flat table, one row per player with the RPH player id: `team-prefixes.csv` beside this file.

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
| 10+ | 110 | 1670 |
| 5–9 | 138 | 932 |
| 3–4 | 105 | 360 |
| 2 | 101 | 202 |

About 353 tags with 3+ players look like real teams, covering roughly 2,962 players (~18% of named players). Two-player tags are a mix of small teams, couples and coincidences.

Caveats: a tag is the literal text, so `[99]` and `[99PL]`, `[LK9]` and `LK9_`, `[INKD]` and `InkD -` may or may not be the same team. Two-letter tags (`[CC]`, `[IO]`, `[GH]`, `TT_`, `MC_`) collide across regions, and a tag written in two styles (`[IO]` vs `IO | Name`) is merged here even where it is probably two teams. Honorifics and first names that look like prefixes (`Mr.`, `Dr_`, `The_`, `Lore_`, `Josh_`) were removed. A player who changed name between events is counted under their latest name only.

## Teams with 10+ players

### `LF` · 46 players · bracket 45, space 1

- [ LF ] W3Duff (`31997`)
- [LF]  MateL (`22209`)
- [LF] Alci (`31007`)
- [LF] Baptiste (`14661`)
- [LF] Camcam (`23935`)
- [LF] Clement Fusade (`29320`)
- [LF] Crisedepseudo (`15998`)
- [LF] DarkPollen (`38072`)
- [LF] DavSong (`13432`)
- [LF] Dedelacharcut (`27193`)
- [LF] Ekkox (`37765`)
- [LF] Eodarow (`16127`)
- [LF] Evilcampbell (`11099`)
- [LF] Inostranka (`24236`)
- [LF] Jibisme (`42160`)
- [LF] Jonatien (`10905`)
- [LF] June (`19761`)
- [LF] Kimahri (`31175`)
- [LF] Lucartes (`15750`)
- [LF] Lyslero (`29205`)
- [LF] Maxwell (`20942`)
- [LF] MInd_Of_Thib (`41539`)
- [LF] Neil (`23107`)
- [LF] Neoh (`20766`)
- [LF] Nostra (`20169`)
- [LF] Obik (`33949`)
- [LF] OMAJ (`31028`)
- [LF] Owlymoly (`20086`)
- [LF] Presk (`14796`)
- [LF] Rafoufou (`207293`)
- [LF] RomanSan (`15959`)
- [LF] Rourir (`52590`)
- [LF] Snip50 (`9053`)
- [LF] SpiritOfTime (`38374`)
- [LF] Tidus (`9222`)
- [LF] Tinkiwinki (`17262`)
- [LF] Tirbu (`23243`)
- [LF] Trendy (`343933`)
- [LF] Trendy (`35162`)
- [LF] Tsu Tsu (`36359`)
- [LF] VintageRedPanda (`16198`)
- [LF] Wolfmike (`12272`)
- [LF] Youpla (`24290`)
- [LF] Ӿ-Tintin (`10900`)
- [LF]Nezutruc (`20243`)
- LF BRICE (`202787`)

### `EC` · 35 players · bracket

- [EC] Aymx (`27911`)
- [EC] Ch'loud (`23485`)
- [EC] Foodzaro (`59143`)
- [EC] Gadock (`24352`)
- [EC] Gege (`21414`)
- [EC] Gon20 (`34319`)
- [EC] JeAn-KaiSse (`43261`)
- [EC] Jerome (`20639`)
- [EC] KaraNyyan (`15642`)
- [EC] kind_47 (`9148`)
- [EC] Lanstark (`15404`)
- [EC] Lorcadys (`20711`)
- [EC] LowlowJ (`20239`)
- [EC] MAGMA (`16087`)
- [EC] Midazo (`20739`)
- [EC] Murphy (`20672`)
- [EC] nazsan (`28588`)
- [EC] Ninhur (`24565`)
- [EC] Paxthunder (`32877`)
- [EC] Pizzaro (`28945`)
- [EC] Poicreux (`19867`)
- [EC] Scipio (`31003`)
- [EC] Sergent Tibs (`16011`)
- [EC] Sethit (`39501`)
- [EC] Swed (`15426`)
- [EC] Ultera (`9685`)
- [EC] Ultera (`78157`)
- [EC] Valvyra (`29089`)
- [EC] Valëstrel (`61506`)
- [EC] Yde (`36284`)
- [EC] Yoh (`21245`)
- [EC] 🌒 Cysu (`36913`)
- [EC]-Qt (`37767`)
- [EC]_Meeko (`68627`)
- [EC]Bucheronz (`18684`)

### `IINK` · 33 players · separator 32, space 1

- IINK Skullz (`17992`)
- IINK_aapod (`13873`)
- IINK_Anna (`48419`)
- IINK_Argyronette (`37859`)
- IINK_Aser (`16944`)
- IINK_BEBITO74 (`47682`)
- IINK_CARENTHYA (`19420`)
- IINK_Chapi (`66164`)
- IInk_chienrouge (`16604`)
- IINK_Fitz (`13878`)
- IINK_Goupil (`74583`)
- IINK_Guillaume (`14318`)
- IINK_Hopela (`40705`)
- IINK_Kazey (`40067`)
- IINK_Laura (`20585`)
- IINK_Loïs (`32639`)
- IINK_Marsou (`17033`)
- IINK_marty_gatfly (`61862`)
- IINK_Merrick (`15874`)
- IINK_Munshine (`41417`)
- IINK_Naek (`18092`)
- IINK_NEGI (`16067`)
- IINK_NeroH (`15384`)
- IINK_Nini (`42190`)
- IINK_Sankreet (`42187`)
- IInk_Seedsir (`35468`)
- IINK_Shingo (`22459`)
- IINK_Siruviel (`27651`)
- IINK_Sonsec (`14282`)
- IINK_Theo (`37854`)
- IINK_Timoule (`34624`)
- IINK_Wis (`27730`)
- IINK_Zedix (`16238`)

### `RL` · 33 players · bracket

- [RL] Alê (`235648`)
- [RL] Bambamths (`277338`)
- [RL] Bia (`231167`)
- [RL] Brunita (`213301`)
- [RL] Carreta (`281990`)
- [RL] Daniel Kabra da Peste (`281021`)
- [RL] Danso (`293002`)
- [RL] Fazendo.lore (`247045`)
- [RL] Felippe Rossello (`406852`)
- [RL] Gabriel "Bisaum" Branco (`235544`)
- [RL] Guina (`183036`)
- [RL] GuJohnson (`296501`)
- [RL] Henrique (`338733`)
- [RL] Inglês (`284894`)
- [RL] jeh_teixeira 🇧🇷 (`279159`)
- [RL] Kamiz (`279160`)
- [RL] LeoMTZZ (`210993`)
- [RL] Leonardo Martins (`240447`)
- [RL] Lisbibi (`287603`)
- [RL] Lucas Braga (`344233`)
- [RL] Lucca (`279162`)
- [RL] Motinha (`264182`)
- [RL] Narumi (`68423`)
- [RL] Pandrelli (`320146`)
- [RL] Rafa Haji (`320998`)
- [RL] Redorat_Destruidor (`257830`)
- [RL] Rodisney (`176135`)
- [RL] Rodrigo de Deus (`319788`)
- [RL] Rox (`334351`)
- [RL] Shadow Monarch (`211399`)
- [RL] Terceiro (`107118`)
- [RL] Thiluminer (`240683`)
- [RL] uiuzera (`295363`)

### `IO` · 31 players · bracket 23, separator 8

- [IO] Akaba33 (`21204`)
- [IO] Bernadette (`196364`)
- [IO] BreizRoro (`20843`)
- [IO] Dkalko (`196346`)
- [IO] Dr Bari (`193178`)
- [IO] Esgus (`225669`)
- [IO] Fablor (`15317`)
- [IO] Gaara3364 (`20919`)
- [IO] Gaheran (`41466`)
- [IO] Guilpau (`39205`)
- [IO] Guino500 (`37140`)
- [IO] Jeffous53 (`23177`)
- [IO] LaCarteKiwi (`20855`)
- [IO] MaitreFranky (`31983`)
- [IO] Mike2407 (`20837`)
- [IO] Pamplemousse (`39254`)
- [IO] SkadiAAL (`36493`)
- [IO] Tekuh (`31190`)
- [IO] Timotheo (`40928`)
- [IO] Titanof (`42369`)
- [IO] TurnIK (`31046`)
- [IO] Yuliisss (`9228`)
- [IO]xRstarx (`28807`)
- IO | Beutze (`14747`)
- IO | BlackMountain (`37080`)
- IO | Feilers7 (`24316`)
- IO | James (`31934`)
- IO | mrMelone92 (`19209`)
- IO | Petnein (`16175`)
- IO | Thekenturner (`18624`)
- IO_Micha (`17632`)

### `TB` · 29 players · separator

- TB ~ Aiwo (`26807`)
- TB ~ Anomalie (`10057`)
- TB ~ ANTO (`10069`)
- TB ~ Atlas (`47943`)
- TB ~ CHRISTIAN (`9496`)
- TB ~ Darktomosore (`32225`)
- TB ~ DixitJenni (`28938`)
- TB ~ Dranael (`10064`)
- TB ~ Flowizzo (`16583`)
- TB ~ Hakio (`15914`)
- TB ~ Ilomer06 (`9929`)
- TB ~ Inkonux (`28916`)
- TB ~ Jerem (`33521`)
- TB ~ Jeskel (`21507`)
- TB ~ Kairixia (`15954`)
- TB ~ Kayymar (`18884`)
- TB ~ Killboum (`23948`)
- TB ~ Natsuko (`32808`)
- TB ~ Rentaro07 (`76044`)
- TB ~ Revany (`27654`)
- TB ~ Silvos (`9675`)
- TB ~ Snoyerz (`9186`)
- TB ~ Tyler (`10049`)
- TB ~ Vixdenice (`27242`)
- TB ~ Zell (`45919`)
- TB-LDSFMrFrench (`33839`)
- TB~blue06370 (`10186`)
- TB~Jukor (`9144`)
- TB~Lamiss2902 (`26907`)

### `IKL` · 28 players · bracket 26, separator 1, trailing 1

- [IKL] Belnika (`41368`)
- [IKL] Borow (`42031`)
- [IKL] Curly (`17332`)
- [IKL] DrZaius (`41903`)
- [IKL] ElGranBoa (`36464`)
- [IKL] Fraxe (`36391`)
- [IKL] Fuzzz (`42214`)
- [IKL] Keristof (`13797`)
- [IKL] MisterZa (`73744`)
- [IKL] Mouche (`12991`)
- [IKL] Nzo (`13798`)
- [IKL] Pupkin (`41360`)
- [IKL] Raven (`16270`)
- [IKL] Reiver (`41993`)
- [IKL] RICHOU (`19950`)
- [IKL] Roberto Larcos (`34219`)
- [IKL] Skadi (`16336`)
- [IKL] Skenraw (`39318`)
- [IKL] Soot (`31008`)
- [IKL] Strog (`34214`)
- [IKL] Tuaphyx (`31010`)
- [IKL] Un jour, un booster (`10398`)
- [IKL] Valou (`39314`)
- [IKL] Wellan (`18707`)
- [IKL] Zicbar (`14223`)
- [IKL]Tomavg (`42131`)
- IKL-Maask (`41453`)
- M[IKL] (`42137`)

### `RBT` · 28 players · separator 16, bracket 12

- [RBT] Cachapa (`33940`)
- [RBT] Cruz (`33298`)
- [RBT] Diogo Araujo (`33955`)
- [RBT] Diogo Martins (`31835`)
- [RBT] Dota (`23820`)
- [RBT] kamadgero (`41689`)
- [RBT] MASA (`11494`)
- [RBT] Micmon (`27133`)
- [RBT] Not_sepcial (`37202`)
- [RBT] Rafael Chaves (`49901`)
- [RBT]Stavenson (`41873`)
- [RBT]© Shot (`41387`)
- RBT-Eregia (`19175`)
- RBT.Christouf (`13882`)
- RBT_Belzé (`15763`)
- RBT_Comina (`24356`)
- RBT_Dougy (`61608`)
- RBT_Elhy (`14251`)
- RBT_Jedje (`14259`)
- RBT_Memel (`42119`)
- RBT_MrPicsou (`28068`)
- RBT_Nock (`38873`)
- RBT_Papydarkmaul (`41828`)
- RBT_PrincessePingouin (`24417`)
- RBT_Ryuna (`38838`)
- RBT_Salty (`41577`)
- RBT_Tcoaster (`13881`)
- RBT_WiseBadger (`75296`)

### `LB` · 27 players · separator

- LB_Aphro (`7288`)
- LB_Bigspoon (`12476`)
- LB_Dekkerboy (`12486`)
- LB_deltamike26 (`22305`)
- LB_Desley (`11411`)
- LB_Ema_Spastico (`18064`)
- LB_Emanuele (`18059`)
- LB_Erwin (`9181`)
- LB_eugeene601 (`22817`)
- LB_Holyghost (`9701`)
- LB_Joowie (`35658`)
- LB_JuLION (`9610`)
- LB_LilTink (`38157`)
- LB_Lionthehawaiian (`8152`)
- LB_LKD (`7700`)
- LB_Lythral (`9714`)
- LB_Menski (`34734`)
- LB_Roberson (`8523`)
- LB_SCAPESHIFT (`8650`)
- LB_SilentD0ct0r (`18066`)
- LB_Sofi (`28069`)
- LB_Spectre (`10417`)
- LB_SuperDaddy (`8258`)
- LB_Tarbarik (`9943`)
- LB_Yensid07 (`12057`)
- LB_yubel (`18068`)
- LB_Zeyeon (`21042`)

### `RHS` · 25 players · separator 24, space 1

- RHS Lukas Kaupa (`41880`)
- RHS-Fuchs Alexander (`30744`)
- RHS_Christian (`44726`)
- RHS_Colinaslan (`44736`)
- RHS_Danxor (`8511`)
- RHS_David (`14474`)
- RHS_Dzenan (`14218`)
- RHS_Earlmeister (`11910`)
- RHS_Harald (`35654`)
- RHS_Jacob Frank (`30715`)
- RHS_Justice (`7010`)
- RHS_LilyPierce🌱 (`42249`)
- RHS_LongDao (`37663`)
- RHS_Martin🐝 (`38936`)
- RHS_McNuffin (`14369`)
- RHS_Mrsilat (`30509`)
- RHS_Mystischer🌀 (`14366`)
- RHS_Nathan_Trippe (`43442`)
- RHS_Niels Hovorka (`40546`)
- RHS_Ricemaster (`37662`)
- RHS_Rozsi (`21658`)
- RHS_RyWalker (`36160`)
- RHS_vanesstra (`25033`)
- RHS_Ying (`14247`)
- RHS_Zan Syed (`41528`)

### `ENC` · 22 players · separator 21, bracket 1

- [ENC] LoL (`8899`)
- ENC_Benjourno (`12457`)
- ENC_Blaze818 (`12460`)
- ENC_Brent (`10032`)
- ENC_chraaa (`37628`)
- ENC_Crzrs (`71801`)
- ENC_DaKneeBoy (`22549`)
- ENC_Danamukai (`92518`)
- ENC_duo (`12477`)
- ENC_Eclipse (`7679`)
- ENC_FlippinEli (`6876`)
- ENC_ItsRatedRK (`12475`)
- ENC_Jesus (`43513`)
- ENC_JonTheRanger (`7965`)
- ENC_Marc (`19070`)
- ENC_Mattchanted (`6884`)
- ENC_Meelee.giant.fairy (`8122`)
- ENC_MikeWins (`32460`)
- ENC_NolanVoid (`12478`)
- ENC_Triton (`8446`)
- ENC_uncannysculpts (`56645`)
- ENC_upNout (`19047`)

### `MC` · 22 players · separator

- MC_akaTJ (`76055`)
- mc_bratwurst (`33541`)
- MC_Brauerei (`35619`)
- MC_Cleopatrick (`21709`)
- MC_DeepBlue (`23960`)
- MC_DeXtrOniC (`14428`)
- MC_G_able (`24971`)
- MC_Grimlok (`20953`)
- MC_iSunny (`10877`)
- MC_JARL (`24924`)
- MC_JeffDerGraue (`13753`)
- MC_K0rshy (`10913`)
- MC_Ketaro (`24816`)
- MC_LookAtTheBacon (`23015`)
- MC_MayLegend (`6312`)
- MC_pwnTom (`15724`)
- MC_ReinerWahnsinn (`9324`)
- MC_rise (`41052`)
- MC_Sanrow (`12944`)
- MC_SarDestiny (`27658`)
- MC_TIM (`76038`)
- MC_WenrA (`11226`)

### `99` · 21 players · bracket

- [99] aioly (`13712`)
- [99] aredotjayyy (`6999`)
- [99] Brianthelionnn (`40273`)
- [99] BruhLife (`7828`)
- [99] dorki3 (`23267`)
- [99] HeyyyItsLJ (`12892`)
- [99] Hoonie (`65298`)
- [99] Hunnymancer (`9856`)
- [99] JAM (`8954`)
- [99] Jsquared3 (`10487`)
- [99] Lowww (`9149`)
- [99] NRC (`29372`)
- [99] Ryopops (`9166`)
- [99] ScoopDowgg (`14824`)
- [99] StrykerJ (`11889`)
- [99] surgecudi (`7166`)
- [99] taigertang (`7909`)
- [99] Tkdgabe (`11464`)
- [99]JonWithTheCoolShirt🐧 (`29386`)
- [99]Valan (`11965`)
- [99]🇵🇭 (`10895`)

### `TT` · 20 players · separator

- TT_BarisF2 (`8011`)
- TT_CuddlesomeTiger (`33270`)
- TT_Doxa (`9994`)
- TT_Egelim (`9507`)
- TT_Flurry (`19193`)
- TT_Gundi (`8945`)
- TT_Iamyourkarma (`9359`)
- TT_Johnny (`9145`)
- TT_LeXtreme (`9227`)
- TT_LUMINATOR (`41864`)
- TT_Makoya (`10003`)
- TT_Marcel Mayer (`34037`)
- TT_Naasty (`9153`)
- TT_Paduaner (`8455`)
- TT_R1N1RA (`18084`)
- TT_RONTE (`11989`)
- TT_Sario Habibio (`12006`)
- TT_Sluppy (`42585`)
- TT_T-Dog (`8220`)
- TT_VnCnT (`13479`)

### `EXP` · 19 players · bracket 17, separator 2

- [EXP] Bhilou (`41347`)
- [EXP] Calim (`56573`)
- [EXP] Ezarion (`24229`)
- [EXP] Haazeel (`18525`)
- [EXP] KrispiT (`10154`)
- [EXP] Kwocs (`16017`)
- [EXP] Liopal (`20244`)
- [EXP] Minato (`11933`)
- [EXP] Missmeeple (`13815`)
- [EXP] NoVoCaiNe (`18568`)
- [EXP] Pataclop (`52977`)
- [EXP] Ramalex (`32137`)
- [EXP] YakuHD (`22524`)
- [EXP] Zethos (`20939`)
- [EXP]AngelLaitToile (`15778`)
- [EXP]OrmeJuge (`38498`)
- [EXP]Testo (`36924`)
- EXP_Brioche (`39309`)
- EXP_Miuz (`24406`)

### `LAKE` · 19 players · separator

- LAKE - Altaris (`19983`)
- LAKE_Alazel (`31958`)
- LAKE_BB (`17477`)
- LAKE_Bolvin (`15325`)
- LAKE_Bros212 (`31682`)
- LAKE_Cincis (`19856`)
- LAKE_Eddy (`30747`)
- LAKE_IlFunky (`38745`)
- LAKE_kiorocket (`17040`)
- LAKE_Lorenzino (`35714`)
- LAKE_Macs (`33491`)
- LAKE_MarcoCatuogno (`21497`)
- LAKE_Mario (`16970`)
- LAKE_Matthew (`10425`)
- LAKE_NoSkill (`13844`)
- LAKE_Orobi (`19833`)
- LAKE_Petra (`34539`)
- LAKE_Skies (`15891`)
- LAKE_Z4K91 (`30203`)

### `THG` · 19 players · separator 10, space 9

- THG Booradley (`28040`)
- THG Crithalla (`7960`)
- THG Figment (`6934`)
- THG Jofar (`16227`)
- THG Johnny_Nonsense (`7375`)
- THG Jrac86 (`7055`)
- THG Ki.n.da (`6847`)
- THG MidGe (`7273`)
- THG Shiz (`21804`)
- THG_Blinx (`8223`)
- THG_CoCo (`7955`)
- THG_Doogley (`6533`)
- THG_Dwiz19 (`6961`)
- THG_Ericjm99 (`17260`)
- THG_KnotchYoTrees (`28383`)
- THG_Micha (`7281`)
- THG_Pave (`9666`)
- THG_Triton 🔱 (`17747`)
- THG_Triton🔱 (`400509`)

### `TSD` · 19 players · separator 15, space 4

- TSD Dark shadow (`27394`)
- TSD FullUhTism (`15164`)
- TSD Hexgirl (`38680`)
- TSD Pikaboo (`44908`)
- TSD-Zeyoss (`14529`)
- TSD_Aidyn (`8782`)
- TSD_Clueless (`10876`)
- TSD_cypr (`11729`)
- TSD_H-Unit (`7169`)
- TSD_Haruda (`301095`)
- TSD_Jake (`6566`)
- TSD_Lady Brit (`22397`)
- TSD_LanitaLoquita (`38212`)
- TSD_Michael (`30091`)
- TSD_MooMan 🐄 (`6394`)
- TSD_Rekkless (`14022`)
- TSD_Techie (`7776`)
- TSD_TheShirtGoblin (`10370`)
- TSD_Tpmcinern (`6506`)

### `LBT` · 18 players · separator 16, space 2

- LBT Kelthret (`31705`)
- LBT Pablo Magan (`31732`)
- LBT_AnaMO (`31910`)
- LBT_andrea (`31817`)
- LBT_Angi🦄 (`176541`)
- LBT_Bobby (`26489`)
- LBT_Cepri (`31704`)
- LBT_Creddish (`36989`)
- LBT_Dani_Art (`31787`)
- LBT_ElPastor (`28612`)
- LBT_Elros (`20703`)
- LBT_Issel🐙 (`20740`)
- LBT_Miky20hz (`21277`)
- LBT_Quque (`31808`)
- LBT_SrCipo (`14825`)
- LBT_STaiLk (`36991`)
- LBT_Wurzang (`15783`)
- LBT_Zer0 (`31710`)

### `RIP` · 18 players · separator 11, bracket 6, space 1

- [RIP] Babidi (`75520`)
- [RIP] Franek (`40880`)
- [RIP] Grabash (`164854`)
- [RIP] Hubson 🇵🇱 (`85077`)
- [RIP] Marianczos (`40875`)
- [RIP] Vantox (`182797`)
- RIP Hiram (`29440`)
- RIP-dam (`28082`)
- RIP-Diablo 72 (`25036`)
- RIP-Gargam (`20572`)
- RIP-Hyrec (`28154`)
- RIP-Jotaro (`28152`)
- RIP-JuJu (`75263`)
- RIP-Kezaa (`28163`)
- RIP-Meline (`28001`)
- RIP-Raekhar (`70314`)
- RIP-trosty49 (`28453`)
- RIP_Bogabo (`61839`)

### `TOL` · 18 players · separator

- TOL_Arn (`28028`)
- TOL_Barox (`20107`)
- TOL_Bestia (`13940`)
- TOL_GBTMP (`15409`)
- TOL_GhostWriter (`14370`)
- TOL_Giorgio (`13415`)
- TOL_IanThunder (`15904`)
- TOL_LoreBOT (`21653`)
- TOL_LukeFinal7 (`15377`)
- TOL_Marco Anceschi (`41833`)
- Tol_Martin Lorcana (`15758`)
- TOL_Peps (`15314`)
- TOL_PivoUlivo (`41823`)
- TOL_Ruggero (`16080`)
- TOL_SilentStorm (`15329`)
- TOL_teoleader (`21647`)
- TOL_Vale (`11104`)
- TOL_WeP (`25218`)

### `ICI` · 17 players · separator 15, space 2

- ICI - Flopiflopa (`10906`)
- ICI Cassy McMuffin (`10919`)
- ICI Ryokuna (`19397`)
- ICI-aislia (`19407`)
- ICI-AuroreBoreale (`18484`)
- ICI-Daftcandy5 (`10997`)
- ICI-DareliK (`9200`)
- ICI-Domino (`20059`)
- ICI-Elmios (`3394`)
- Ici-Gaet (`18434`)
- ICI-GeyDey (`10977`)
- ICI-Iziagaia (`18536`)
- ICI-Kiwi (`16384`)
- ICI-Midosan (`20101`)
- ICI-Morphistic (`20117`)
- ICI-Pierrax (`19307`)
- ICI-Stellorn (`16124`)

### `IKO` · 17 players · separator

- IKO | Bleynkii (`10270`)
- IKO | Bleynkii (`44684`)
- IKO_Bananza (`18561`)
- IKO_Beppo (`25224`)
- IKO_Carrier (`14252`)
- IKO_Crosseden (`32847`)
- IKO_Erebos (`38655`)
- IKO_GeMo (`41854`)
- IKO_Johannes (`38061`)
- IKO_Johnskobam (`40529`)
- IKO_Kilzin (`11150`)
- IKO_PhiZ1 (`11195`)
- IKO_SalamanMax (`15304`)
- IKO_Samral (`14175`)
- IKO_Sayman (`11468`)
- IKO_Spike (`35086`)
- IKO_xsolution (`18546`)

### `INKD` · 17 players · separator 11, bracket 6

- [INKD] anabarbarasp (`248526`)
- [INKD] Bruno Casanova (`316975`)
- [INKD] Dipelaez (`247650`)
- [INKD] Mtz1n (`244820`)
- [INKD] Sahgnoma (`247643`)
- [INKD] Vinicius (`301896`)
- InkD - Chachaloup (`45187`)
- InkD - Cortex ✨ (`12445`)
- InkD - Petrus 🍷 (`16378`)
- InkD - Reivax (`33711`)
- InkD - Spidey (`8830`)
- InkD - Stygma (`62326`)
- InkD - Tatoune (`38446`)
- InkD - Thibaut 🐢 (`35134`)
- InkD - Totish (`33682`)
- InkD - Vae (`45186`)
- InkD -Sleepy_Dragon (`48359`)

### `OUD` · 17 players · separator

- OUD_ARMYesSir (`50107`)
- OUD_Asethys (`9495`)
- OUD_Clem/Lumi (`50085`)
- OUD_Cobalpie (`15525`)
- OUD_Didine (`27831`)
- OUD_JeRo (`10854`)
- OUD_JohdaGAWD (`7303`)
- OUD_Lorcanard (`33805`)
- OUD_Man0n (`27030`)
- OUD_Mowldu (`19905`)
- OUD_Ozyris (`9490`)
- OUD_Philuc58 (`9652`)
- OUD_riri (`217908`)
- OUD_Sarabi (`38423`)
- OUD_Soapbe (`17178`)
- OUD_Spyder6 (`38427`)
- OUD_Xander (`9653`)

### `THM` · 17 players · separator 10, bracket 6, space 1

- [THM] N (`37453`)
- [THM] Vivi (`61905`)
- [THM] Whisperer (`32858`)
- [THM]SageDevil (`24718`)
- [THM]Squall (`33957`)
- [THM]「 ✦ Shinruka ✦ 」 (`61907`)
- THM Anthroux (`30860`)
- THM | Ju (`36401`)
- THM-Archeus3000 (`283145`)
- THM-Archeus3000 (`22333`)
- THM_CaptainBarbeuk (`30295`)
- THM_Chenipan_77 (`40991`)
- THM_Draco (`17209`)
- THM_Fen (`16332`)
- THM_Mayou (`29323`)
- THM_Symba (`17126`)
- THM_Thibard (`40987`)

### `CHNORD` · 16 players · separator

- CHNORD_Anima59150 (`42206`)
- CHNORD_Becca (`39239`)
- CHNORD_bobo_oh (`22173`)
- CHNORD_Corel (`30763`)
- CHNORD_igu (`15980`)
- CHNORD_Kelyscha (`21296`)
- CHNORD_Koka1 (`22963`)
- CHNORD_LapHun (`25209`)
- CHNORD_Lolo_Dodo (`31992`)
- CHNORD_Mike (`14646`)
- CHNORD_Nagrom (`41362`)
- CHNORD_Sarou (`19885`)
- CHNORD_Strawberry (`23411`)
- CHNORD_Sugatchooli (`25207`)
- CHNORD_Thom (`14640`)
- CHNORD_Tito (`84765`)

### `ICONIC` · 16 players · separator

- ICONIC_CINIME (`9488`)
- Iconic_ConnerMc23 (`42613`)
- Iconic_FarmerBoy (`120922`)
- ICONIC_Flügelschlägerin (`29027`)
- ICONIC_GHOSTI (`42914`)
- ICONIC_Inkrad (`17338`)
- ICONIC_MbuziXenia (`42023`)
- ICONIC_Miriam (`9469`)
- ICONIC_NeteXX (`16055`)
- ICONIC_Ruppi09 (`9485`)
- ICONIC_Sebastian (`13587`)
- ICONIC_Shorty (`11687`)
- ICONIC_TheHairy (`31624`)
- ICONIC_TheWillHallExp (`14129`)
- Iconic_WhiteChocoBear (`9697`)
- ICONIC_Wyopi (`10135`)

### `IM` · 16 players · separator 10, bracket 6

- [IM] Anton (`286658`)
- [IM] FabienGS (`15643`)
- [IM] Remzy (`11418`)
- [IM]Natsir (`395255`)
- [IM]Romainpsj (`210841`)
- [IM]Shinogawa (`26841`)
- IM_Alcor (`16572`)
- IM_Cocai (`8075`)
- IM_Dadojacky (`29547`)
- IM_Luke95 (`33873`)
- IM_Matteorouge (`32709`)
- IM_MattMelt (`33451`)
- IM_Mino860 (`29549`)
- IM_nextlevelklodio (`30769`)
- IM_NP (`10348`)
- IM_Spaghuetti (`28900`)

### `LD` · 16 players · separator 14, space 2

- LD Dani P (`34199`)
- LD Mateo (`36925`)
- LD_Arual (`15707`)
- LD_DaniFernandez (`26840`)
- LD_Domanke (`33754`)
- LD_IcpMara (`15702`)
- LD_JoseAngel991 (`11614`)
- LD_Juanfra (`34198`)
- LD_Koma (`34194`)
- LD_Lorfessor (`21366`)
- LD_McPlanck (`30393`)
- LD_Miko (`37912`)
- LD_Milanés (`42175`)
- LD_Takagi (`34886`)
- LD_Tertrix (`33987`)
- LD_thevine (`19201`)

### `MK` · 16 players · separator 15, space 1

- MK Joda85 (`22005`)
- MK_Castle (`19957`)
- MK_Chicho (`9904`)
- MK_Creg (`37106`)
- MK_Danny (`14190`)
- MK_Hesiro (`21437`)
- MK_ifoughtthelore (`14445`)
- MK_Ink_a_Belle (`16532`)
- MK_Joy (`200552`)
- MK_Joy (`29883`)
- MK_Loreando (`18480`)
- MK_Rachel (`24018`)
- MK_Rizoman (`9612`)
- MK_Taury (`19935`)
- MK_TripleJ (`14193`)
- MK_TurtleBauer (`14238`)

### `TSR` · 16 players · separator 15, space 1

- TSR Closey (`41866`)
- TSR-Henksen (`9041`)
- TSR-Mokel (`41858`)
- TSR-Nmzs (`234564`)
- TSR-RedEyesKeke (`36609`)
- TSR-Schmelle (`7266`)
- TSR-Sytoba (`6552`)
- TSR-Sāsse (`36437`)
- TSR-Zumnis (`60100`)
- TSR_Andree (`19290`)
- TSR_BBop (`29008`)
- TSR_BigBaranoia (`280531`)
- TSR_Matze (`13824`)
- TSR_Max (`22074`)
- TSR_Mohoo (`10838`)
- TSR_ooangelinaoo (`30764`)

### `Æ` · 16 players · bracket

- [Æ] Adamoth (`22831`)
- [Æ] BowZerK (`31906`)
- [Æ] Doomjohn BzK (`25081`)
- [Æ] Enzmae (`15812`)
- [Æ] eЯRata (`43792`)
- [Æ] Huillem (`17166`)
- [Æ] LeSphax (`43161`)
- [Æ] Matec (`25124`)
- [Æ] Niicow (`42219`)
- [Æ] Quystys (`25054`)
- [Æ] SimC11 (`33909`)
- [Æ] Wardiablo (`37585`)
- [Æ] Yum (`23442`)
- [Æ] Zerojanvier (`15808`)
- [Æ]Minusia (`41394`)
- [Æ]Wilor (`31916`)

### `DARKWINGS` · 15 players · separator

- DarkWings | Chupa (`36249`)
- DarkWings | Corvus (`49007`)
- DarkWings | Inkspired (`15669`)
- DarkWings | Jussi (`12686`)
- DarkWings | Khargon (`9516`)
- DarkWings | LorcanaBasti (`10665`)
- DarkWings | MarsiDarsi (`9314`)
- DarkWings | Mo (`9210`)
- DarkWings | MrMamille (`12757`)
- DarkWings | Percy (`24460`)
- DarkWings | Salamibus (`202545`)
- DarkWings | Secret (`10784`)
- DarkWings | Till (`76669`)
- Darkwings | Tommydo0 (`24946`)
- DarkWings | Vanni (`12309`)

### `EMI` · 15 players · bracket 14, separator 1

- [EMI] akko (`24020`)
- [EMI] Alpaca🦙 (`13884`)
- [EMI] BOUCHACHOSS (`283159`)
- [EMI] BOUCHACHOSS 🔥 (`23482`)
- [EMI] Dorsao 🦊 (`23627`)
- [EMI] LaChazzz 🦉 (`16280`)
- [EMI] Michel Dorado (`23656`)
- [EMI] Mordo 🌴 (`42255`)
- [EMI] Mythïcs (`13429`)
- [EMI] Nelson23⚡️ (`15652`)
- [EMI] RobsTheBrave 🦥 (`25213`)
- [EMI] simC4 (`174162`)
- [EMI] Six (`29673`)
- [EMI] TheEmoPizza 🍕 (`42162`)
- EMI_DarkRasiel (`40287`)

### `FT20` · 15 players · bracket

- [FT20] AuntiesQ (`14715`)
- [FT20] Austin (`16335`)
- [FT20] BigBlake (`36520`)
- [FT20] DreambornDanielle (`46699`)
- [FT20] elg (`35894`)
- [FT20] Hooch (`16632`)
- [FT20] IronM@n (`16930`)
- [FT20] JonVonSchweetz (`14497`)
- [FT20] JP (`43218`)
- [FT20] Kaynando (`7890`)
- [FT20] Klrgch (`7879`)
- [FT20] Lucyfer (`8225`)
- [FT20] Studded (`11152`)
- [FT20] tristan2nice (`14890`)
- [FT20]WhatTheBuck (`8756`)

### `HI` · 15 players · bracket

- [Hi] Albator (`31809`)
- [HI] edoSituation13 🥵 (`136658`)
- [Hi] Evazive (`36282`)
- [Hi] font font font... (`20246`)
- [Hi] Franckyy (`31700`)
- [Hi] Jestar (`15303`)
- [Hi] Joueur de Cyberpunk TCG (`16186`)
- [Hi] Leo 🍄🐳 (`9476`)
- [Hi] Lyls (`23394`)
- [Hi] Mamzelle-Mag (`23388`)
- [Hi] Marteau (`12933`)
- [Hi] Parmentier (`17661`)
- [Hi] Styxxia (`9140`)
- [Hi] Tistaouch87 (`23402`)
- [HI]Maldini93 (`83791`)

### `LK9` · 15 players · bracket 8, separator 6, space 1

- [LK9] Btp (`37160`)
- [LK9] Cédric (`39376`)
- [LK9] Guicot (`17225`)
- [LK9] lesveves (`28494`)
- [LK9] Lisa (`17228`)
- [LK9] Tim (`16967`)
- [LK9] Yuki (`17108`)
- [LK9]_La_C (`283132`)
- LK9 Pata (`17220`)
- Lk9_adri (`25173`)
- LK9_JigFlow (`17103`)
- LK9_Moelleuh (`17107`)
- LK9_Perceronce (`39498`)
- Lk9_Tetram (`211551`)
- Lk9_Tetram (`41938`)

### `LNT` · 15 players · separator

- LNT_Carchuler (`19101`)
- LNT_CoKeoNe (`30881`)
- LNT_Dasein (`28941`)
- LNT_Gladyum (`10749`)
- LNT_Jackks (`42112`)
- LNT_Juanma (`40332`)
- LNT_Marionetas (`9573`)
- LNT_Neiker (`69483`)
- LNT_Panda (`13020`)
- LNT_Romperal (`7336`)
- LNT_Sensei (`6805`)
- LNT_Shadow (`20550`)
- LNT_Vartosh (`22766`)
- LNT_Velveck (`19959`)
- LNT_VictoRCDM (`22048`)

### `LV` · 15 players · bracket

- [LV] Artemizu (`47922`)
- [LV] bahrynowskijakub (`45567`)
- [LV] bartoszk (`42145`)
- [LV] Bernard (`27849`)
- [LV] Boledrag (`30019`)
- [LV] Chrapek (`47932`)
- [LV] Esus (`9135`)
- [LV] JacaCaca (`42048`)
- [LV] Kuczi (`47934`)
- [LV] Mattsonn (`15421`)
- [LV] Mayxs (`15385`)
- [LV] Olawa (`15451`)
- [LV] Pandainred (`42114`)
- [LV] SenseMyLore (`46895`)
- [LV] Yoza (`42271`)

### `ONEL` · 15 players · separator

- OneL-Newton712 🍏 (`12285`)
- OneL_Bicky (`186338`)
- OneL_Cremortel (`32618`)
- OneL_jeremteach (`27923`)
- OneL_JoyBoy (`196756`)
- OneL_keizo 🦊 (`15542`)
- Onel_kiki (`33076`)
- OneL_LorcAnanas 🍍 (`12646`)
- Onel_mokkori (`12926`)
- OneL_MoTo (`17998`)
- OneL_Rito (`17410`)
- OneL_Scorp (`12203`)
- OneL_SnowingLight (`24876`)
- OneL_Vinsanity (`16003`)
- OneL_Vortex (`27972`)

### `VILLAIN` · 15 players · trailing

- AprilW [Villain] (`12769`)
- AustinG [Villain] (`10514`)
- BeinaSLACKER [Villain] (`10536`)
- Blake [Villain] (`8587`)
- Blake [Villain] (`22954`)
- Brandie [Villain] (`11183`)
- Cassidy [Villain] (`21666`)
- D. Lanham [Villain] (`34010`)
- Hannah H [Villain] (`7997`)
- Hurleycz [Villain] (`7961`)
- Joe Momma [Villain] (`10244`)
- LorcanaBCB [Villain] (`6664`)
- Richard Perry [Villain] (`11013`)
- SirLos [Villain] (`32351`)
- Vaderllama [Villain] (`8706`)

### `WDL` · 15 players · bracket 8, separator 7

- [WDL] AngieHarmonie (`36363`)
- [WDL] Indeferdy (`51912`)
- [WDL] Majora1 (`33014`)
- [WDL] Metallovitch (`33018`)
- [WDL] Skyara (`9070`)
- [WDL] Vensas (`36368`)
- [WDL] Yu-yevo (`70107`)
- [WDL]Hammerheadz (`42171`)
- WDL-Hane (`232014`)
- WDL_Imajic (`9758`)
- WDL_InkVeil (`20752`)
- WDL_Judocu (`11108`)
- WDL_Lambi (`31653`)
- WDL_Norena (`10214`)
- WDL_Stygiian 🍭 (`10375`)

### `🐀` · 15 players · emoji

- 🐀 Aliar 🐀 (`65432`)
- 🐀 Muffincia 🐀 (`35754`)
- 🐀 Sheitene 🐀 (`34032`)
- 🐀 szyymser 🐀 (`311586`)
- 🐀Ada_April🐀 (`136508`)
- 🐀Bart_April🐀 (`136428`)
- 🐀Bayo jayo (`15334`)
- 🐀GUZIN🗿🐀 (`50634`)
- 🐀IamDearDeer🦌🐀 (`27830`)
- 🐀Karation☕🐀 (`35761`)
- 🐀Liryq🐀 (`33060`)
- 🐀Pendżi 🐀 (`35769`)
- 🐀Slonce 🌚🐀 (`9286`)
- 🐀Terry 🥖🐀 (`10870`)
- 🐀Zergulek🐀 (`7609`)

### `BTD` · 14 players · separator

- BTD_Arnold_pe (`22278`)
- BTD_Calzius (`50474`)
- BTD_ebr88 (`22067`)
- BTD_Eolina93 (`22119`)
- BTD_GB7 (`35083`)
- BTD_Ichi55555 (`22275`)
- BTD_LordGhost (`14624`)
- BTD_Makihuete (`30734`)
- BTD_Moragas (`22303`)
- BTD_OnixRedwood (`32664`)
- BTD_Rafiki_ (`15630`)
- BTD_Ruhana_ELF (`14688`)
- BTD_sixra (`31154`)
- BTD_Togiba (`22072`)

### `CC` · 14 players · bracket 7, separator 6, space 1

- [CC] Alastor 🐊 (`11113`)
- [CC] Alastor 🐊 (`196423`)
- [CC] Aliaboubou 🐊 (`60983`)
- [CC] Kwel30🐊 (`11115`)
- [CC] Lorcasab 🐊 (`11658`)
- [CC] MGM 🐊 (`11112`)
- [CC] Raklur 🐊 (`60984`)
- CC Prymor (`16324`)
- CC_Gorkain (`11713`)
- CC_Kev (`11159`)
- CC_Mrx🐊 (`15480`)
- CC_phalanthir13🐊 (`12724`)
- CC_Ricochet (`7470`)
- CC_Sir_Papi (`38105`)

### `HLC` · 14 players · separator

- HLC_CeeGee (`34322`)
- HLC_Green (`10097`)
- HLC_ImboSlice (`7181`)
- HLC_KIMBO (`9008`)
- HLC_Lorcajosh (`10102`)
- HLC_Marc (`28644`)
- HLC_Naijul (`20125`)
- HLC_NickG (`30269`)
- HLC_PhelanKell (`12711`)
- HLC_Retax (`74404`)
- HLC_Robin (`6403`)
- HLC_Robin (`33189`)
- HLC_Tracker (`31239`)
- HLC_Yoyo (`41383`)

### `IBW` · 14 players · separator 13, space 1

- IBW Thaonir (`19138`)
- IBW_Aghar (`27284`)
- IBW_Astharoth (`45920`)
- IBW_Borchas (`19338`)
- IBW_ElDeLaGorra (`33634`)
- IBW_Fermio (`56660`)
- IBW_Goldor (`31016`)
- IBW_GossipKing (`25199`)
- IBW_Korkenzieher (`28636`)
- IBW_Maikis (`30296`)
- IBW_Merlín (`28630`)
- IBW_Miye (`28638`)
- IBW_Panda (`13000`)
- IBW_Vishous (`28637`)

### `INKRJ` · 14 players · bracket

- [INKRJ] Assis Edu (`232762`)
- [INKRJ] BigPandaGuy (`282080`)
- [INKRJ] Carlos_Souza (`253557`)
- [INKRJ] Daren (`206009`)
- [INKRJ] Georgialeao (`206015`)
- [INKRJ] JFKrug (`210149`)
- [INKRJ] Kurt Flame (`211732`)
- [INKRJ] Leo Dantas (`231024`)
- [INKRJ] LordArawn (`265728`)
- [INKRJ] Mari Simões (`353707`)
- [INKRJ] TB (`73957`)
- [INKRJ] VictorHug09 (`273672`)
- [INKRJ] | Illuminurso (`268005`)
- [INKRJ]PaesLeme(pai) (`73968`)

### `LE` · 14 players · separator

- LE_andii (`11140`)
- LE_CasheTheFlash (`16676`)
- LE_Chefkoch (`14169`)
- Le_Coq_Allan (`25204`)
- LE_DaddyDave (`34427`)
- LE_Fabi (`24172`)
- LE_GroßerDaniel (`24952`)
- LE_Le_Fuechs (`24988`)
- LE_LOLcana (`9076`)
- LE_Maximus (`66056`)
- LE_SiaNova (`66057`)
- LE_SKar (`24646`)
- LE_Trapgoose (`23201`)
- LE_ZeRnixleR (`25077`)

### `LFG` · 14 players · separator 13, space 1

- LFG HeyHiHelloItsCristin (`35844`)
- LFG_4GOTT3N1 (`8571`)
- LFG_AndiiMar (`36629`)
- LFG_Carsofel (`14271`)
- LFG_DannyPhoKing (`36619`)
- LFG_Frank (`16693`)
- LFG_Hunkules (`228941`)
- LFG_J-Mills (`16696`)
- LFG_Lobo (`14660`)
- lfg_mckenzie (`6883`)
- LFG_PastaMagic (`45398`)
- LFG_Phill (`8527`)
- LFG_TheShadowSlash (`36624`)
- LFG_Wunglu (`33375`)

### `MIP` · 14 players · separator

- MIP_Dennel (`10157`)
- MIP_DomDom (`10225`)
- MIP_Dr.Greenthumb301 (`25142`)
- MIP_lorcanalena (`9302`)
- MIP_marslorcana (`9332`)
- MIP_Maxi (`60828`)
- MIP_MDF (`19255`)
- MIP_Miri (`60821`)
- MIP_NickiTCG (`15163`)
- MIP_Peatitano (`24712`)
- MIP_Rob (`24719`)
- MIP_Ryuuzaki (`10163`)
- MIP_Steffen (`221173`)
- MIP_Terminatoast (`176786`)

### `PIMP` · 14 players · emoji

- | pimp | Augusto Cheme (`30955`)
- | pimp | Caio Giovanni (`240646`)
- | pimp | Carolinne (`240649`)
- | pimp | GCardoso (`72406`)
- | pimp | Ivan Silva (`29948`)
- | pimp | Jade ✨️ (`210015`)
- | pimp | Lari Cheme (`74747`)
- | pimp | Lucas Paglia (`72062`)
- | pimp | Murata (`199420`)
- | pimp | Natan Santos (`72449`)
- | pimp | Raphael Machado (`263314`)
- | pimp | Rebolla (`73373`)
- | pimp | Rômulo Rocha (`74757`)
- | pimp | Vitor Fasanaro (`66028`)

### `PYR` · 14 players · bracket

- [PYR]  Neohi (`15582`)
- [PYR] BenJ (`27266`)
- [PYR] D@MS (`26824`)
- [PYR] DNL (`22240`)
- [PYR] Elorri (`42411`)
- [PYR] Fab (`36931`)
- [PYR] GlouGlouS (`13903`)
- [PYR] Kuro (`211393`)
- [PYR] Lagolass (`9839`)
- [PYR] Lord (`14088`)
- [PYR] Mérida (`18501`)
- [PYR] Tamto (`13968`)
- [PYR] ThiT (`16035`)
- [PYR] W8kie (`30795`)

### `TINK` · 14 players · bracket 13, separator 1

- [TINK] Albrich (`55601`)
- [TINK] Andrea Eme Te (`55599`)
- [TINK] ChopSueii (`20733`)
- [TINK] Ferran Val (`18855`)
- [TINK] GAS (`33452`)
- [TINK] GENNESIS (`91225`)
- [TINK] Guillem (`9198`)
- [TINK] iddqd89 (`9958`)
- [TINK] Lucky (`33455`)
- [TINK] McDuff (`36645`)
- [TINK] Mente (`33591`)
- [TINK] Truetony (`18635`)
- [TINK]_Pleakley (`42842`)
- TINK_Charmeur (`42168`)

### `GOAT` · 13 players · separator 12, space 1

- GOAT Schnaan (`10711`)
- GOAT | Blub (`6837`)
- GOAT | Conny (`30738`)
- GOAT | Conny (`141250`)
- GOAT | DanTheMan (`26520`)
- GOAT | Frittenfett (`9092`)
- GOAT | Kevin (`9182`)
- GOAT | Lorecaneer_Robin (`9013`)
- GOAT | Lorecaneers | Günni (`33716`)
- GOAT | Lorecaneers | Jens (`33644`)
- GOAT | Nayro (`9338`)
- GOAT | Rafa (`14207`)
- GOAT | Sief (`29287`)

### `KDH` · 13 players · separator

- KdH - König ♠️ | Joschi (`34417`)
- KdH - ♠️ 8 - REVO (`20768`)
- KdH - ♠️Sieben  - Xyerra (`15593`)
- KdH - ♣️ 10 - Laude (`280565`)
- KdH - ♣️7 - Arco (`15583`)
- KdH - ♥️Königin (`15623`)
- KdH - ❤️9 - Flin (`155800`)
- KdH -♦️10 - FlowRida (`234396`)
- KdH -❤️5 - Showtime (`15616`)
- KdH-♠️10 (`38431`)
- KdH-♠️2 | Sorry (`8458`)
- KdH-♠️Ace-Romario (`15996`)
- KdH-🖤8 (`47307`)

### `KSI` · 13 players · separator 12, space 1

- KSI - Zaickz (`216370`)
- KSI Micha (`43219`)
- KSI | Rica (`30458`)
- KSI-Cr0nY (`15416`)
- KSI-DieAntwort90 (`10211`)
- KSI-Joschy (`34449`)
- KSI-Kay (`9649`)
- KSI-Kuba (`30771`)
- KSI-Rene (`29233`)
- KSI-Schaffi (`29271`)
- KSI-Shinuslaw (`28876`)
- KSI-Tuan (`16001`)
- KSI-Weroschka (`29558`)

### `OL` · 13 players · separator

- OL-Pride (`61932`)
- OL_Aarathan (`62094`)
- OL_Alfieillumineer (`17167`)
- OL_Brighty (`15867`)
- OL_Chlo (`16577`)
- OL_Coletrain (`30036`)
- OL_DocSteph (`37139`)
- OL_JakeTheSnake (`32025`)
- OL_JD413 (`26988`)
- OL_Jools (`17254`)
- OL_Okan (`14493`)
- OL_PigGuru (`17237`)
- OL_Zexora (`14260`)

### `PD` · 13 players · separator

- PD_Anika (`9866`)
- PD_Bennet (`7291`)
- PD_BRANN (`8873`)
- PD_DerHut (`11073`)
- PD_Freakout (`28675`)
- PD_Haertelus (`7471`)
- PD_Membis (`9867`)
- PD_Nachtgeist (`9137`)
- PD_Nils (`30897`)
- PD_PromisedLand (`41777`)
- PD_PusherGene (`34038`)
- PD_SchonOK (`9835`)
- PD_Sl4sH (`43412`)

### `PRT` · 13 players · bracket

- [PRT] Arkhamis (`25004`)
- [PRT] Bodhy (`25016`)
- [PRT] Caly22 (`25186`)
- [PRT] Damanna (`40381`)
- [PRT] Fildo (`23554`)
- [PRT] GrandPatin (`23707`)
- [PRT] Harry (`227904`)
- [PRT] Jujucookie29 (`65383`)
- [PRT] Maho.i (`334201`)
- [PRT] Osikara (`32799`)
- [PRT] Sinead (`42240`)
- [PRT] ThiK (`74970`)
- [PRT] Underskore (`23523`)

### `SNC` · 13 players · separator

- SnC_Awuillaume (`33827`)
- SnC_bH (`9873`)
- SnC_Caraxes (`34331`)
- SnC_Delta (`24138`)
- SnC_Dyga (`34190`)
- SnC_ElyCrowne (`33785`)
- SnC_Fab (`64639`)
- SnC_Jack Los Muertos (`46562`)
- SnC_Leomi (`34665`)
- SnC_Mathandmagic (`190083`)
- SnC_Nightlandre (`24193`)
- SnC_Tarkhos (`34059`)
- SnC_Zaziar (`18567`)

### `TP` · 13 players · separator

- TP | goggelz (`15364`)
- TP | Jay_ramen (`30276`)
- TP | Jay_ramen (`30832`)
- TP | polyvulpes (`30249`)
- TP | PrinzKaos (`20130`)
- TP | Zook (`41936`)
- TP-Pablo (`184636`)
- TP_Aquil0tti (`77114`)
- TP_CapoP (`21523`)
- TP_Emperor (`30536`)
- TP_LaBadante (`21493`)
- TP_Mezzasega (`56794`)
- TP_Popipapi98 (`21541`)

### `TTS` · 13 players · bracket 10, separator 3

- [TTS] Dashew (`40342`)
- [TTS] Dim (`56242`)
- [TTS] Gaugau380 (`18682`)
- [TTS] Gorack (Lorcadier) (`35688`)
- [TTS] HoJ (`36343`)
- [TTS] Mekissa27 (`69077`)
- [TTS] MK (`59968`)
- [TTS] Morane (`50618`)
- [TTS] Utopiq (`16019`)
- [TTS]-[TRK] (`111394`)
- TTS_Kodaa (`9134`)
- TTS_Marfire (`39775`)
- TTS_Rabiooso (`40340`)

### `TZ3` · 13 players · separator

- TZ3_Azhag88 (`21315`)
- TZ3_Bomber (`28097`)
- TZ3_Capra19 (`25220`)
- TZ3_Eluccia (`21324`)
- TZ3_KIT (`233671`)
- TZ3_Leaf (`19891`)
- TZ3_Lorensium (`190092`)
- TZ3_MadBall (`15498`)
- TZ3_Meloku (`15751`)
- TZ3_Odrane (`28119`)
- TZ3_POMATA (`28090`)
- TZ3_rulkallos (`30183`)
- TZ3_TYSON (`21355`)

### `UWU` · 13 players · separator

- UwU_Caduc / Martin (`21987`)
- UwU_Chuck Moritz (`144230`)
- UwU_Derendus (`12743`)
- UwU_Diaflo (`11041`)
- UwU_Hartlife (`25111`)
- UwU_Kardo (`43359`)
- UwU_Key Guardian (`9035`)
- UwU_Larry (`4854`)
- UwU_MarConOne (`19437`)
- UwU_Martosch (`11938`)
- UwU_Schroedy (`15356`)
- UwU_TheBigOne (`41988`)
- UwU_TinkLisa (`72031`)

### `BBB` · 12 players · separator

- BBB_Amano (`38366`)
- BBB_Breezy (`15274`)
- BBB_Bryniffer (`53629`)
- BBB_Camz626 (`18377`)
- BBB_CRICKET_JIMINY (`15505`)
- BBB_DrunkEdge (`15241`)
- BBB_FabTricks (`37029`)
- BBB_glimmeric (`15905`)
- BBB_Jenchanted (`148038`)
- BBB_Lexie_Pooh (`19021`)
- BBB_Otaku (`15182`)
- BBB_SaschaH (`41991`)

### `BLG` · 12 players · bracket

- [BLG] Andrea (`17734`)
- [BLG] Carlish (`15599`)
- [BLG] Diego M 🧞 (`18166`)
- [BLG] Faqui (`10809`)
- [BLG] Hasbu (`7014`)
- [BLG] Jamao (`6865`)
- [BLG] JesusR (`31702`)
- [BLG] khaleendra (`9371`)
- [BLG] Marku (`6911`)
- [BLG] Pedro Gutiérrez (`38554`)
- [BLG] RafaOx (`33024`)
- [BLG] Shivazelda (`43248`)

### `FP` · 12 players · separator 11, bracket 1

- [FP]Fullicorne (`59317`)
- FP-BrownFitz (`14585`)
- FP-DmT (`18870`)
- FP-Madgertha (`41331`)
- FP-Motnahp (`23543`)
- FP-MOUMOUSSE (`21323`)
- FP-PigeonusRamusBleutus (`2000`)
- FP-Ridnac (`18665`)
- FP-Thomas (`17389`)
- FP-Valbatros (`19120`)
- FP-xzm (`19112`)
- FP-Zakin (`18612`)

### `INK` · 12 players · separator 9, bracket 3

- [INK] Kroniic (`38729`)
- [INK] Le moustachu (`83050`)
- [INK] TheBlackSuitcase (`38714`)
- Ink _inc Mike (`40408`)
- INK-DoReMy (`12872`)
- Ink-Inc-Dave (`28207`)
- Ink.Howler (`33078`)
- INK_Annie_Girard (`12875`)
- INK_Goofy (`42002`)
- INK_SebastienP07 (`12868`)
- INK_ShiftM&MTurn2forever (`6773`)
- INK_Simon Lanthier (`9032`)

### `INKA` · 12 players · separator

- INKA_Andy (`19941`)
- INKA_Askidream (`29685`)
- INKA_Chaotic_Clown (`18565`)
- INKA_ClaireObscur (`14327`)
- INKA_Clément (`19958`)
- INKA_Flôô (`29690`)
- INKA_Hakuna_Mata_Thaïs (`19936`)
- INKA_Jérem' (`26480`)
- INKA_Karnksva (`18509`)
- INKA_Méli-Mélo (`18062`)
- INKA_Stor (`25141`)
- INKA_Thibossu (`72573`)

### `TG` · 12 players · separator

- TG_ADDUX (`18128`)
- Tg_Ale28 (`29759`)
- TG_Briciolo (`6898`)
- Tg_Davy92 (`29758`)
- TG_Javi (`56515`)
- TG_LoChef (`28032`)
- TG_Moricons (`21377`)
- TG_mostrodemare (`28934`)
- TG_MrBana86 (`9204`)
- TG_Pols (`213626`)
- TG_Ric (`21424`)
- TG_Stelfio (`23777`)

### `TIC` · 12 players · separator 11, space 1

- TIC I Niewi (`283845`)
- TIC | Cardhunter (`9948`)
- TIC | Deathsc0ut (`32697`)
- TIC | Jack-Jack-B (`183486`)
- TIC | LoreLifter (`32680`)
- TIC | Lucas (`32698`)
- TIC | Miroque (`19440`)
- TIC | MuhQ (`15282`)
- TIC | Paul (`32788`)
- TIC | PowerPainter (`30949`)
- TIC | Taxnado (`34082`)
- TIC|BizepsBrawler (`19521`)

### `TLCN` · 12 players · bracket

- [TLCN] Chuten (`16094`)
- [TLCN] Holleb (`38852`)
- [TLCN] Karnaud (`44676`)
- [TLCN] Outi (`75771`)
- [TLCN] Shadow (`29326`)
- [TLCN]-Bidou (`36253`)
- [TLCN]-EmilieC (`38033`)
- [TLCN]-Mortuoz (`11611`)
- [TLCN]-MrNocide (`30730`)
- [TLCN]-Spectromium (`40967`)
- [TLCN]Atlantyde (`30994`)
- [TLCN]Ben_as2pik (`21123`)

### `TOEP` · 12 players · separator

- TOEP | Franck (`25096`)
- TOEP-Toutty (`33688`)
- TOEP-Toutty (`283170`)
- TOEP_Genesix (`14361`)
- TOEP_HanHui (`40807`)
- TOEP_Jekeul (`21291`)
- TOEP_Loumea91 (`41544`)
- TOEP_MAD_TROLL (`47947`)
- TOEP_Moute (`41478`)
- TOEP_RatBanks (`41309`)
- TOEP_Revolv (`36288`)
- TOEP_VerandaLux (`33684`)

### `WDTA` · 12 players · separator

- WDTA_Bruti (`11597`)
- WDTA_Dark4row.T (`11628`)
- WDTA_dePee1996 (`7466`)
- WDTA_Guido (`26811`)
- WDTA_Hadezu (`9635`)
- WDTA_IronMaidenWesley (`10412`)
- WDTA_Mari (`10821`)
- WDTA_Sanoy (`10368`)
- WDTA_SirKencelot (`10401`)
- WDTA_Socharis (`9619`)
- WDTA_Theboko (`10391`)
- WDTA_TheFallen8 (`13853`)

### `BIL` · 11 players · separator

- BiL | Asgrotan (`11569`)
- BiL | Bsching (`6825`)
- BiL | Chris (`6835`)
- BiL | Herolt (`7380`)
- BiL | KaijuManu (`6727`)
- BiL | MatDembo (`11928`)
- BiL | Pasqualitto (`13172`)
- BiL | Sascha (`9096`)
- BiL | Zabrox (`7382`)
- BiL_cap (`13591`)
- BiL_franky_1908 (`30133`)

### `BRJ` · 11 players · separator

- BRJ-AoDCronoS (`16024`)
- BRJ-CHAMPION (`17518`)
- BRJ-Daredevil (`29091`)
- BRJ-Elyero (`15960`)
- BRJ-etch (`17514`)
- BRJ-Frieren27 (`23968`)
- BRJ-Kevin L (`288807`)
- BRJ-Koruldia / Florian (`17025`)
- BRJ-Ninou (`15942`)
- BRJ_AleD2 (`17513`)
- brj_jejdh (`28660`)

### `EQ` · 11 players · separator

- EQ - Andrés (`38565`)
- EQ - Carla 🌷 (`39612`)
- EQ - Hextor fire (`12400`)
- EQ - Kofy21 (`39660`)
- EQ - Kylar (`149389`)
- EQ - Vicky ✨ (`9551`)
- EQ_Dantebcn85 (`12346`)
- EQ_Gonzo99 (`12333`)
- EQ_Laura77 (`41326`)
- EQ_Moonchild (`12341`)
- EQ_TheNaxOn (`12331`)

### `FPG` · 11 players · separator

- FPG-AuraOfLucario (`20249`)
- FPG_Barber (`7546`)
- FPG_Broken (`34008`)
- FPG_Casemind (`76599`)
- FPG_Chilley (`1802`)
- FPG_Frisco (`38008`)
- FPG_Jibberystyleoinkerys (`8784`)
- FPG_Just Jennifer (`14895`)
- FPG_Kiros Skye (`37107`)
- FPG_TheSkipper (`28103`)
- FPG_unCAGEDgamez (`8896`)

### `FZD` · 11 players · bracket

- [FZD] Ambush (`27034`)
- [FZD] ducardi (`25065`)
- [FZD] Frosdra (`23265`)
- [FZD] Hayabusa (`22153`)
- [FZD] MaG (`10127`)
- [FZD] Marcel (`25070`)
- [FZD] Shipsy (`50216`)
- [FZD] teivcheese (`44049`)
- [FZD] TMH (`29054`)
- [FZD] Wambo_M (`22276`)
- [FZD] Xanthis (`9593`)

### `GG` · 11 players · separator

- GG_Adriana (`36545`)
- GG_andi99 (`15612`)
- GG_ElMapache (`9672`)
- GG_Lido (`15775`)
- GG_Lido (`274706`)
- GG_Mushuu (`20126`)
- GG_PriDoc (`9341`)
- GG_RyuukDante (`9177`)
- GG_Simon (`15515`)
- GG_Tachi (`14117`)
- GG_Timtheus90 (`9156`)

### `IAT` · 11 players · bracket 10, separator 1

- [IAT] Alberic (`56130`)
- [IAT] Alexx (`22222`)
- [IAT] Borf (`39456`)
- [IAT] Crayshi (`17117`)
- [IAT] Emi (`37225`)
- [IAT] GreatPlayerOnizuka (`17118`)
- [IAT] Ophélie Pelloux-Prayer (`36280`)
- [IAT] Tinuviel (`56110`)
- [IAT] Willy (`37201`)
- [IAT] YannTCG (`14215`)
- IAT_Orrest92 (`33942`)

### `IKB` · 11 players · bracket

- [IKB] Absalom (`16103`)
- [IKB] Bisous (`79705`)
- [IKB] Blou the gungan (`34095`)
- [IKB] DavriX (`34450`)
- [IKB] Fineas (`11309`)
- [IKB] FredWayne (`31841`)
- [IKB] Greggoss (`31856`)
- [IKB] HinaK (`34274`)
- [IKB] Illya (`15801`)
- [IKB]Stefy (`36523`)
- [IKB]Trollbarad (`22960`)

### `IOQ` · 11 players · bracket

- [IoQ] FlyingPizzaDude (`43103`)
- [IoQ] Greenis (`37967`)
- [IoQ] MickeMozart (`28050`)
- [IoQ] Ogge-E (`41423`)
- [IoQ] SiggeMcLuck (`33566`)
- [IoQ] Xorath (`43101`)
- [IoQ]ArcticRN (`42307`)
- [IoQ]Hanska (`28127`)
- [IoQ]Jonne (`38510`)
- [IoQ]Spoket49 (`41840`)
- [IoQ]Ventrikelflimmer (`45077`)

### `IRN` · 11 players · separator

- IRN | AndreCruz (`24934`)
- IRN | Darksteel (`13757`)
- IRN | Enchannika (`19128`)
- IRN | GnF (`19972`)
- IRN | ITfairy 🧚🏻‍♂️ (`30470`)
- IRN | keo (`16322`)
- IRN | keo (`368481`)
- IRN | Randalex (`15795`)
- IRN | shinobi64 (`15725`)
- IRN | Swordinator (`27057`)
- IRN | TopChicken (`15392`)

### `IVKR` · 11 players · separator 9, bracket 2

- [IVKR] LordDevon (`28605`)
- [IVKR]Banana (`9642`)
- IVKR_Alice (`24335`)
- IVKR_Bebel (`46576`)
- IVKR_BubbleMan (`13437`)
- IVKR_BubbleWomen (`13435`)
- IVKR_Damballah (`22838`)
- IVKR_Khana (`42260`)
- IVKR_Kobeasty (`9650`)
- IVKR_Lestat (`13431`)
- IVKR_Nonow (`56268`)

### `LST` · 11 players · separator

- LST_Atzepeng (`38179`)
- LST_DoitsuKoitsu (`18162`)
- LST_Filho (`27262`)
- LST_JamieMc (`22345`)
- LST_KiJoB (`9301`)
- LST_Kuptain (`21460`)
- LST_MartyGeorge (`26984`)
- LST_Maruin (`30215`)
- LST_SquG3 (`42035`)
- LST_SvensoN (`12662`)
- LST_Zyrasss (`42233`)

### `LZK` · 11 players · separator

- Lzk-Symon (`33853`)
- LZK_Chaton (`33742`)
- LZK_corb15 (`33857`)
- LZK_Irngrim (`196486`)
- LZK_kqas (`43357`)
- LZK_Laureen (`20504`)
- LZK_Marchesa (`39681`)
- LZK_Mioumiou (`33862`)
- LZK_Nemo (`9403`)
- LZK_Tchorizo (`9111`)
- LZK_Xera (`34342`)

### `M7` · 11 players · bracket 9, separator 2

- [M7] damaneks 🇵🇱 🏔️ (`9208`)
- [M7] Emanuel 🇵🇱 🗻 (`27673`)
- [M7] Gr4b4rz (`9275`)
- [M7] Greyvall (`11077`)
- [M7] Krzysztof Kasak (`15423`)
- [M7] Leopold (`262432`)
- [M7] Losiowaty 🫎 (`10742`)
- [M7] michalek iks (`9209`)
- [M7] stankol (`7558`)
- M7_macieksik (`176790`)
- M7_warfi (`32866`)

### `NEX` · 11 players · separator

- NEX_Absolem (`24004`)
- NEX_Bento (`12728`)
- NEX_BrandonLnt (`49088`)
- NEX_Bucco (`9313`)
- NEX_Faraen (`9805`)
- NEX_MaroneFed (`42616`)
- NEX_NemesisSTARS (`31407`)
- NEX_Sora (`46560`)
- NEX_Xime (`60581`)
- NEX_Ysu (`16002`)
- NEX_Zepher (`12613`)

### `OB` · 11 players · bracket

- [OB] Badnoizes (`10153`)
- [OB] Cellendhyll 😈 (`11037`)
- [OB] Chee-Hoo (`11035`)
- [OB] Deraniel (`39289`)
- [OB] Judge_Dredd (`9765`)
- [OB] LaDaronne#BE (`10074`)
- [OB] MachaS (`39288`)
- [OB] NaaV (`52953`)
- [OB] Syka (`11699`)
- [OB] Zakalem (`9939`)
- [OB] Zéphyr (`9808`)

### `PJ` · 11 players · bracket

- [PJ] Esdrubael (`47953`)
- [PJ] Gwendoline2928 (`45284`)
- [PJ] Korosha (`32047`)
- [PJ] Mateo (`314598`)
- [PJ] Math (`23510`)
- [PJ] Redfox (`16976`)
- [PJ] Renio (`17712`)
- [PJ] Yann (`19415`)
- [PJ] Yoann (`22024`)
- [PJ]Nopanik (`38718`)
- [PJ]Titix (`110205`)

### `TEI` · 11 players · separator

- TEI_ KatieBug28 (`53343`)
- TEI_AmyWeekley (`10094`)
- TEI_Angry.Duck (`19439`)
- TEI_Dan (`11531`)
- TEI_FrozenFrac (`16499`)
- TEI_Grace (`17692`)
- TEI_JAD909 (`77971`)
- TEI_Kendyc223 (`6796`)
- TEI_Mike (`45569`)
- TEI_operationjenn (`53532`)
- TEI_RTA51 (`11902`)

### `TGGR` · 11 players · separator

- TGGR_Ben (`17832`)
- TGGR_Eckroth (`17804`)
- TGGR_Jahdy (`17830`)
- TGGR_JuicyJ (`43788`)
- TGGR_KatazTrofic (`16271`)
- TGGR_Part_Timer (`36789`)
- TGGR_SixSeven (`19683`)
- TGGR_Slomar (`34894`)
- TGGR_Slubbery (`49696`)
- TGGR_Top4Tay (`17802`)
- TGGR_🅱️ector (`16817`)

### `TJ` · 11 players · separator 10, space 1

- TJ C. (`19067`)
- TJ-LiDurd3n (`187498`)
- TJ_ Chana (`40140`)
- TJ_LeAxis (`11881`)
- TJ_Padrino🦀 (`279824`)
- TJ_PiXeL (`45010`)
- TJ_Pops (`201069`)
- TJ_Sauris (`14942`)
- TJ_Snow217 (`40139`)
- TJ_TioC (`40141`)
- TJ_Xray (`15770`)

### `ZTL` · 11 players · separator 10, space 1

- ZTL Xeneizes (`9288`)
- ZTL. Etto (`23667`)
- ZTL_Bellerofonte (`9367`)
- ZTL_Bibis (`7370`)
- ZTL_Enofirg (`7771`)
- ZTL_Gattone87 (`13919`)
- ZTL_Giulietta (`13927`)
- ZTL_Militico (`27192`)
- ZTL_Monkey (`8029`)
- ZTL_Neverlucky (`7354`)
- ZTL_Utini (`7505`)

### `DEGENS` · 10 players · separator

- DEGENS_Athollord (`36630`)
- DEGENS_Brandon (`19301`)
- DEGENS_Duffman (`9770`)
- DEGENS_Lunar (`25122`)
- DEGENS_Meejum (`25123`)
- DEGENS_Nat (`14092`)
- DEGENS_Oodelally 🏹 (`9896`)
- DEGENS_Rachael (`19371`)
- DEGENS_Ronnie (`25133`)
- DEGENS_TheMagicBunnet (`26513`)

### `GBG` · 10 players · separator

- GBG-J (`14663`)
- GBG_BrinkRN85 (`6589`)
- GBG_MaFuggin (`6827`)
- GBG_MarkE (`13645`)
- GBG_Ron (`13161`)
- GBG_Scott_Free (`6595`)
- GBG_Sheebs (`6656`)
- GBG_Will2 (`6591`)
- GBG_ZachG1 (`6882`)
- GBG_Zucchini (`23556`)

### `GLIM` · 10 players · bracket 9, separator 1

- [Glim] BBJokeR (`21034`)
- [Glim] Biway (`21945`)
- [Glim] Crowscabaret (`30152`)
- [Glim] Cruellila (`28267`)
- [Glim] DrRebus (`13637`)
- [Glim] Ekhis (`28699`)
- [Glim] NINOWIS (`29005`)
- [Glim] Severstahl (`21536`)
- [Glim]ChazAlex (`21023`)
- GLIM_Cramist (`14857`)

### `HP` · 10 players · separator

- HP_Aasaka (`14102`)
- HP_Bahason (`15879`)
- HP_Erylis (`56443`)
- HP_FOXY (`16018`)
- HP_Gorzeum (`15869`)
- HP_MEW (`18010`)
- HP_Nexeo (`19913`)
- HP_Silver (`15699`)
- HP_Yrales (`15821`)
- HP_Zielfing (`18007`)

### `MAD` · 10 players · separator

- Mad-Max-Inkrangers-LLH (`42912`)
- MAD_Kathrin (`9126`)
- MAD_Lift (`13856`)
- MAD_LuckyOswald (`30219`)
- MAD_Moony 🐶 (`9184`)
- MAD_Nik (`9159`)
- MAD_Pyropuschel (`9386`)
- MAD_TaiCT (`22749`)
- MAD_Wayward Son (`8974`)
- MAD_wboy (`9254`)

### `MKT` · 10 players · separator

- MKT_Arctic_Eden (`15398`)
- MKT_fabjos (`24958`)
- MKT_Fantos (`22112`)
- MKT_FlyingSquirrel (`20255`)
- MKT_Kevkong 🐭 (`15411`)
- MKT_Luettii (`13452`)
- MKT_Maria123 (`20188`)
- MKT_ReCiffer (`17621`)
- MKT_SailorGuardian (`13451`)
- MKT_SkelliBoi (`13456`)

### `NOT` · 10 players · separator 7, space 3

- NOT IAN (`21223`)
- NOT MICHELL (`27429`)
- NOT ROGER (`27425`)
- NOT_CHEWBE (`19775`)
- NOT_Cleo (`25211`)
- NOT_IenaRidens (`31951`)
- NOT_Maestro (`19754`)
- NOT_Mauialonesssss (`25210`)
- NOT_Tony (`9421`)
- NOT_Xemnas (`25214`)

### `P626` · 10 players · separator

- P626_Cris (`42237`)
- P626_Fabas (`13155`)
- P626_Il tinez (`200403`)
- P626_Ilmancios (`20172`)
- P626_Loremario9 (`25201`)
- P626_Maurio (`23436`)
- P626_Melanzan (`14521`)
- P626_Muccismucci (`20168`)
- P626_RicM14 (`20674`)
- P626_SolcaNubi (`75275`)

### `PT` · 10 players · separator

- PT_AJ42🚀 (`10473`)
- PT_Galaxdriel🚀 (`10791`)
- PT_George 🐳 (`13198`)
- PT_GuЯu 🚀 (`22330`)
- PT_JJ 🚀 (`10811`)
- PT_Knelo🚀 (`68924`)
- PT_Logan 🚀 (`10785`)
- PT_Lumbre🔥 (`10794`)
- PT_Meyhe 🐥 (`10793`)
- PT_Soriano851🚀 (`35181`)

### `SI` · 10 players · separator

- SI_Batze (`18045`)
- SI_Bazul86 (`20520`)
- SI_Eksort (`15885`)
- SI_Fidi (`11792`)
- SI_Gizmobashor (`276279`)
- SI_Goal (`26778`)
- SI_Inso (`15470`)
- SI_LorcAndy (`9376`)
- SI_MamaLorcana (`9564`)
- SI_Toto (`37997`)

### `TEAM_BADSLIPPER` · 10 players · separator

- Team_Badslipper_Brian (`9350`)
- Team_Badslipper_Daphne (`180023`)
- Team_Badslipper_Denni (`9342`)
- Team_Badslipper_Joris (`28823`)
- Team_Badslipper_Kris (`8128`)
- Team_Badslipper_Mrieske (`11874`)
- Team_Badslipper_Pelle (`30422`)
- Team_Badslipper_Robbe (`18589`)
- Team_Badslipper_Shark0Killer (`12917`)
- Team_Badslipper_Siebe (`20724`)

### `ZG` · 10 players · separator

- ZG_ArYu (`241055`)
- ZG_ChiHung (`99892`)
- ZG_FaFa (`188006`)
- ZG_Fred (`56689`)
- ZG_Kelvin (`178068`)
- ZG_Ken15447 (`75500`)
- ZG_Krystal (`426924`)
- ZG_Nap (`60156`)
- ZG_Nic (`60831`)
- ZG_Ryan Stephen (`77457`)

### `♾️` · 10 players · emoji

- ♾️ Eric the Bearded Prince (`38343`)
- ♾️ Free win (`15827`)
- ♾️ Jinzo (`19752`)
- ♾️ ThatMoKid (`44253`)
- ♾️ YoSoyDeven (`44314`)
- ♾️1 Billion Crabs🦀 (`41419`)
- ♾️Cpt Rogers (`14502`)
- ♾️Jabottle (`14233`)
- ♾️KristonD (`14101`)
- ♾️The People’s Chump (`22503`)

## Teams with 5–9 players

### `3INK` · 9 players · bracket

- [3ink] AppleSith (`34170`)
- [3ink] AppleSith (`273359`)
- [3ink] bdileanis (`6676`)
- [3ink] Krezkrieg (`11403`)
- [3ink] Matthew77 (`21157`)
- [3ink] Sealcar (`40694`)
- [3ink] Sorcerer's Hat YT (`6738`)
- [3ink] SpaceRanger (`9830`)
- {3ink}Huynasaur (`47219`)

### `ALTAINK` · 9 players · bracket

- [ALTAINK] Dadipooh (`28064`)
- [ALTAINK] Goldberg (`24166`)
- [ALTAINK] GreatBibi (`27682`)
- [ALTAINK] Hapy (`27712`)
- [ALTAINK] Molita (`28059`)
- [ALTAINK] Nerfazim (`4616`)
- [ALTAINK] roro (`35718`)
- [ALTAINK] Samiam_iam (`27837`)
- [ALTAINK] Vanhi (`24214`)

### `BIQ` · 9 players · separator

- BiQ_DaMaddin (`13928`)
- BiQ_fluffycookie (`11800`)
- BiQ_Fly (`42765`)
- BiQ_Gork (`13521`)
- BIQ_Hannes (`20769`)
- BiQ_Hufi (`20745`)
- BiQ_Makuz (`20756`)
- BiQ_Mischo (`14555`)
- BiQ_Reko (`32154`)

### `CCREW` · 9 players · bracket

- [CCREW]  Cap. Manu Torre🤟🏻 (`70061`)
- [CCREW] cazabichosana 🍲🦄 (`10422`)
- [CCREW] Delosbrown (`232566`)
- [CCREW] IGS (`32668`)
- [CCREW] Nony (`21607`)
- [CCREW] Riven (`66053`)
- [CCREW] UnCactus (`22732`)
- [CCREW] Valentín (`50480`)
- [CCREW] Álvaro Roca (`28615`)

### `CS` · 9 players · separator

- CS_Aggrivated (`6801`)
- CS_Bair (`8564`)
- CS_Brad (`8014`)
- CS_ChrisMost (`32233`)
- CS_Heartthrob (`16440`)
- CS_Hole_In_The_Earth (`35376`)
- CS_Just_Stef (`7533`)
- CS_Mikayla (`10835`)
- CS_Redtau (`23636`)

### `DDL` · 9 players · separator

- DDL_AmauryS7 (`9822`)
- DDL_DarkGab257 (`23550`)
- DDL_Kleinz (`9841`)
- DDL_Makouni (`12461`)
- DDL_Revi (`3484`)
- DDL_Tracah (`12246`)
- DDL_TwinSab (`9215`)
- DDL_YugiHawkins (`9434`)
- DDL_Zuklaus (`9531`)

### `ILLUMITREES` · 9 players · trailing

- Alexander (ILLUMITREES) (`27799`)
- Brent to my will (Illumitrees) (`24588`)
- Eh Dinge (ILLUMITREES) (`12955`)
- Flashy (ILLUMITREES) (`11233`)
- JeNeVer [ILLUMITREES] (`9249`)
- Jess (ILLUMITREES) (`40550`)
- KurtL  (ILLUMITREES) (`6759`)
- Randy86 (ILLUMITREES) (`9012`)
- Vynleuwe  (ILLUMITREES) (`12971`)

### `INKSHOP` · 9 players · bracket

- [INKSHOP] Ibai (`8540`)
- [INKSHOP] Lore Pirate (`8237`)
- [INKSHOP] Megan (`45386`)
- [INKSHOP] neurofuzz (`10096`)
- [INKSHOP] O2H O2H (`8698`)
- [INKSHOP] POX (`7666`)
- [INKSHOP] StephCurry (`7583`)
- [INKSHOP] Teagan (`8770`)
- [INKSHOP] typical (`240198`)

### `LAME` · 9 players · separator

- LAME-Optimus-Online (`9050`)
- LAME_Daad (`9054`)
- LAME_elNido (`4957`)
- LAME_Ivor (`7585`)
- LAME_MartyTheRock (`7461`)
- LAME_Mies (`12722`)
- LAME_Nibs (`9513`)
- LAME_Niekje😸 (`176154`)
- LAME_Wandlamp (`18520`)

### `MGINK` · 9 players · bracket 8, separator 1

- [MGINK] Buckrocks (`18453`)
- [MGINK] Kawaikat (`16056`)
- [MGINK] neyla0902! (`176156`)
- [MGINK] Noka (`34379`)
- [MGINK] Nordlys (`12932`)
- [MGINK] Petite Fleur (`179568`)
- [MGINK]Blackspar0w77 (`43887`)
- [MGINK]Yappy_Tiger_9474 (`19172`)
- MGINK_Hades (`29657`)

### `OSA` · 9 players · bracket

- [OSA] Drago 🇵🇱🏔️ (`54686`)
- [OSA] Erlod 🇵🇱🏔️ (`90599`)
- [OSA] Gaby (`32704`)
- [OSA] helisa (`35407`)
- [OSA] Moluk🇵🇱🏔️ (`30812`)
- [OSA] Rico 🇵🇱 🏔️ (`75471`)
- [OSA] Staś (`15610`)
- [OSA] Voj4k 🐝🇵🇱 (`7581`)
- [OSA] Zavada 🇵🇱 🐝 (`62296`)

### `RKS` · 9 players · bracket 8, separator 1

- [RKS] Azrael (`13492`)
- [RKS] Guidam (`21253`)
- [RKS] Le Rookie (`13523`)
- [RKS] Lucas Peyrol (`20656`)
- [RKS] Totot (`15328`)
- [RKS] Tyzicos (`20690`)
- [RKS] Wayne (`9269`)
- [RKS]-Khirho (`20658`)
- RKS_Dodo (`27948`)

### `ROV` · 9 players · bracket

- [ROV] Andy (`23663`)
- [ROV] Andy the Grape🍇 (`8435`)
- [RoV] BING BONG (`29795`)
- [ROV] Jimmy (`6768`)
- [ROV] Kirsten (`13990`)
- [ROV] KristentheGrape🍇 (`211610`)
- [ROV] The Mayor 🎩 (`8375`)
- [ROV] Vince (`6881`)
- [ROV]Teacup (`29950`)

### `SF` · 9 players · separator 5, bracket 3, space 1

- [SF] Izaro (`32638`)
- [SF] Scalba (`28601`)
- SF DameFabiola (`209000`)
- SF_Calsinox (`32960`)
- SF_ENDER (`35817`)
- SF_Sasuken (`44557`)
- SF_Strix (`30266`)
- SF_Topolino (`17097`)
- {SF} kuliimon (`28798`)

### `TL` · 9 players · separator

- TL | Matthias (`31318`)
- TL | mcmike82 (`14154`)
- TL | MSchillmaier (`34978`)
- TL | Nathalie S (`11254`)
- TL | TobiOas (`9335`)
- TL.AZ (`420632`)
- TL.Captain (`420631`)
- TL.GBA.Kai (`70824`)
- TL.Ida (`70825`)

### `TLS` · 9 players · separator 7, bracket 2

- [TLS] Merlimocho (`15993`)
- [TLS] Wyzel (`32116`)
- TLS-Kuroko (`13513`)
- TLS_Astoria_D_Thomas (`11735`)
- TLS_Bunnyfreeze (`32900`)
- TLS_BunnyWinter (`22637`)
- TLS_Cookymonster (`37709`)
- TLS_Geppo86 (`11734`)
- TLS_Wendigo's Fandango (`11714`)

### `TMI` · 9 players · bracket 8, separator 1

- [TMI] Encrée (`20478`)
- [TMI] Exodor-XIII (`28029`)
- [TMI] KenKa (`16385`)
- [TMI] Lorekeepler (`15453`)
- [TMI] Speedy (`17454`)
- [TMI] Sraby (`28986`)
- [TMI]Micka (`19212`)
- TMI_Chipeur (`22754`)
- {TMI} Ludmyya (`16327`)

### `TOP` · 9 players · separator

- ToP-Andrielle (`24749`)
- ToP-Axyose (`27716`)
- ToP-Chabrone (`22001`)
- ToP-Jesupower (`24264`)
- ToP-Karayor (`22556`)
- ToP-Loulou (`14202`)
- ToP-Max (`14185`)
- ToP-Rémi (`24270`)
- ToP-Setth (`81254`)

### `$OU` · 8 players · bracket

- [$OU] Aartka (`20483`)
- [$OU] Dinnitz (`12454`)
- [$OU] Gus (`20654`)
- [$OU] Mr Fredricksen (`22902`)
- [$OU] Saléme (`17822`)
- [$OU] Toupou (`22910`)
- [$OU]Guma (`27950`)
- [$OU]Quoridor (`20970`)

### `2319` · 8 players · bracket

- [2319] Chav (`14015`)
- [2319] Glowstar (`46941`)
- [2319] Grande_510 (`11493`)
- [2319] Moosh47 (`6844`)
- [2319] The Lore Counter (`36103`)
- [2319] topdecktony (`210661`)
- [2319] Travis (`16890`)
- [2319]Pandakid (`33367`)

### `ALT` · 8 players · separator

- ALT | LaValuche (`26951`)
- ALT | Lindorie23 (`16065`)
- ALT | Ophelle (`26938`)
- ALT | Owshun (`30800`)
- ALT | Owshunette (`37176`)
- ALT | Sanguinius (`16036`)
- ALT | Soorak (`16046`)
- ALT | Êiko (`27925`)

### `BATTLEBEARS` · 8 players · separator

- BattleBears | AkatsukiCap (`15987`)
- BattleBears | AshaFigaro (`9868`)
- BattleBears | DragonBT (`20167`)
- BattleBears | Gonk (`20147`)
- BattleBears | Hetti89 (`20160`)
- BattleBears | Jurki (`9097`)
- BattleBears | Pew_Pew (`20150`)
- BattleBears | SöR3N (`74663`)

### `BP` · 8 players · separator 7, space 1

- BP - Mr Smee (`31620`)
- BP Mr Smee (`31618`)
- BP_Adonais (`33009`)
- BP_Dinu (`14443`)
- BP_Stardust (`35075`)
- BP_Warou (`8007`)
- BP_Willioufouf (`10880`)
- BP_Yadup1 (`10898`)

### `DINK` · 8 players · separator

- DINK_brismith (`39024`)
- DINK_Chris (`8779`)
- DINK_Ink King (`33197`)
- DINK_Jstover42 (`14813`)
- DINK_LukeG27 (`50643`)
- DINK_MoNkEyHuNtEr36 (`38812`)
- DINK_Shayd (`14997`)
- DINK_Sway 🎶 (`18344`)

### `GLITCHED` · 8 players · bracket

- (Glitched)Tron (`24556`)
- [Glitched] Kyo46 (`85866`)
- [Glitched] NICO (`29370`)
- [Glitched] Obsolete (`33453`)
- [Glitched] Sn00py! (`39218`)
- [Glitched]Bubba711 (`282199`)
- [Glitched]Mayor (`267507`)
- [Glitched]Tinc (`11548`)

### `GOTL` · 8 players · separator

- GOTL_LorkaNils (`9104`)
- GOTL_Ludo_Mk (`34320`)
- GOTL_Mackenshi (`24259`)
- GOTL_MATON (`10956`)
- GOTL_Morningstar⭐️ (`30817`)
- GOTL_Picsou (`36550`)
- GOTL_SVDeroka (`10975`)
- GOTL_Vivi (`30976`)

### `HMG` · 8 players · separator

- HMG_Dennis (`334506`)
- HMG_Derek (`277291`)
- HMG_Herman (`70809`)
- HMG_JoyBoy (`231619`)
- HMG_KK (`56100`)
- HMG_LAVINE (`284034`)
- HMG_Shirley (`221401`)
- HMG_TizzY (`427863`)

### `IKS` · 8 players · separator 5, space 3

- IKS Drakurin (`35170`)
- IKS Josh907 (`20812`)
- IKS Mamastitch (`31247`)
- IKS_CptGab (`39127`)
- IKS_DerPzyko J (`30969`)
- IKS_Funderburker (`31248`)
- IKS_GGPeak (`31197`)
- IKS_int3rcept (`23920`)

### `IMO` · 8 players · separator

- IMO_Dominizi (`23470`)
- IMO_DonCarlito (`782`)
- IMO_Fabster (`14232`)
- IMO_foron (`13097`)
- IMO_infamousVKO (`20559`)
- IMO_noah (`14269`)
- IMO_struchi (`9059`)
- IMO_Yatzek (`41797`)

### `LC` · 8 players · separator

- LC ~ Dorrak (`15388`)
- LC ~ Illegalplayer😈 (`9203`)
- LC ~ Koen (`6873`)
- LC_ Marcobroly (`32255`)
- LC_Nifnif (`31086`)
- LC_Nimgarthiel (`30918`)
- LC_Nono (`18709`)
- LC_VGlaceon (`43610`)

### `LGL` · 8 players · separator 6, space 2

- LGL Jonathan Chung (`53071`)
- LGL Silestone (`33617`)
- LGL-Erwan (`33616`)
- LGL-Sneckzy (`33620`)
- LgL_Djal (`17966`)
- Lgl_gael (`20961`)
- LGL_Hoshi (`33619`)
- LGL_Leradounaud (`21090`)

### `LK` · 8 players · separator

- LK-KeyzZ (`41887`)
- LK_BADXHAND (`10963`)
- LK_JonKaos (`11350`)
- LK_LorcanaSpinz (`10772`)
- LK_MATTERDADDY (`21823`)
- LK_Sweek (`37751`)
- LK_thewrightnick (`9921`)
- LK_Ziething (`28123`)

### `LL` · 8 players · separator 7, bracket 1

- [LL] Pichou (`71012`)
- LL_alexa_zbg (`14305`)
- LL_Chackalena (`23498`)
- LL_HimbeerKiller (`11262`)
- LL_MeepleSchreck (`12862`)
- LL_Poisarella (`22868`)
- LL_Sahrii.Bla (`34772`)
- Ll_the_lorcanalady (`11789`)

### `MTM` · 8 players · separator

- MTM-Baoxsb (`31078`)
- MTM-Hitsu (`40009`)
- MTM-Naloan (`30206`)
- MTM-WarOeil (`207447`)
- MTM_Olkhean (`41429`)
- MTM_p2rbls (`51975`)
- MTM_Santor (`29037`)
- MTM_Toncoiffeur (`30209`)

### `NG` · 8 players · bracket

- [NG] Flaxeau (`31952`)
- [NG] Hawks (`13490`)
- [NG] Naok (`24180`)
- [NG] Swandai (`12256`)
- [NG] Thor31 (`25253`)
- [NG] Toon (`18029`)
- [NG] Val' (`18446`)
- [NG] Vixcious (`35641`)

### `OLC` · 8 players · separator

- Olc _ isa (`24320`)
- OLC-SleepinBeauty (`27958`)
- OLC_Aresius02 (`27927`)
- OLC_Aulann (`27572`)
- OLC_Jerem (`218984`)
- OLC_LauD1719 (`27970`)
- OLC_Scrooge (`27946`)
- OLC_thix (`186355`)

### `PK` · 8 players · separator 7, space 1

- PK Bot (`418012`)
- PK_12thLore (`36569`)
- PK_ArbiterandreA (`13627`)
- PK_BABYCRUDELIAA🦂🖤🤍 (`27209`)
- PK_bookinair1 (`42111`)
- PK_Lupo_rosso (`21690`)
- PK_NotInkableCris 🐈‍⬛ (`10332`)
- PK_Tex (`17016`)

### `RNC` · 8 players · bracket

- [RNC] Arba (`24763`)
- [RNC] Daypers (`21989`)
- [RNC] Mamieours (`21984`)
- [RNC] MasterGus (`27094`)
- [RNC] Mémé (`24982`)
- [RNC] Olfinar (`24775`)
- [RNC] Slipkmat (`22613`)
- [RNC]Paiinh (`11609`)

### `TF` · 8 players · separator

- TF | Auriga (`26485`)
- TF | Black Eagle (`11267`)
- TF | JezuzTristus (`16338`)
- TF | Leana (`19837`)
- TF | RocketRuepelFlo (`12999`)
- TF | Sasmih (`12300`)
- TF | Sventos (`32748`)
- TF | Ticklebarry (`31670`)

### `TFL` · 8 players · separator

- TFL_Alex (`9307`)
- TFL_Derkoch (`7326`)
- TFL_DerKochZwei (`11818`)
- TFL_Kachy (`8194`)
- TFL_Papierflieger (`23534`)
- TFL_TuneZ (`7271`)
- TFL_Webster (`23419`)
- TFL_Wolfverine72 (`7329`)

### `WLT` · 8 players · separator

- WLT_Bear (`27845`)
- WLT_Cripster20 (`9720`)
- WLT_Ginker (`263079`)
- WLT_Mery (`10389`)
- WLT_tamtami (`17207`)
- WLT_Violeta (`27889`)
- WLT_VITI95 (`27896`)
- WLT_Yoli (`9705`)

### `WTCG` · 8 players · bracket

- [WTCG] Bison Blanc (`43860`)
- [WTCG] FUF (`41352`)
- [WTCG] Hextrakt (`43861`)
- [WTCG] Okamiyukiii (`67945`)
- [WTCG] R1 (`48347`)
- [WTCG]FG (`20142`)
- [WTCG]Grooff (`34348`)
- [WTCG]MrMunky (`17589`)

### `BDM` · 7 players · separator

- BDM_Alexios (`22028`)
- BDM_Anithrandir (`22006`)
- BDM_brumario44 (`26897`)
- BDM_Gianmaria28 (`22004`)
- BDM_iitzmanu (`22012`)
- BDM_SirAlexios (`162115`)
- BDM_Unkmor (`7805`)

### `BFF` · 7 players · trailing

- AstralAzur [BFF] (`10849`)
- Audestria [BFF] (`9912`)
- Benjamin [BFF] (`33690`)
- Caillou [BFF] (`21591`)
- Kedked [BFF] (`42155`)
- Kiamu [BFF] (`42148`)
- Reddillyana [BFF] (`19996`)

### `BKS` · 7 players · bracket

- [BKS] AntoineM (`24762`)
- [BKS] Ciwan (`27071`)
- [BKS] Genez (`27059`)
- [BKS] Keisa (`26889`)
- [BKS] LaMush (`22961`)
- [BKS] Normandwizard (`11404`)
- [BKS] Seikil (`25128`)

### `BNK` · 7 players · bracket

- [BNK] CinghioCinci (`19160`)
- [BNK] D4nk8 🐅 (`15502`)
- [BNK] DrNdo (`200392`)
- [BNK] Felpato88 (`10257`)
- [BNK] Lorpal (`15557`)
- [BNK] Piro23 (`24361`)
- [BNK] Salvo_333 (`200390`)

### `BRICK` · 7 players · separator

- Brick_around_n_find_out (`6293`)
- Brick_DannyDanstar (`11426`)
- Brick_JannizZz (`15503`)
- Brick_MaxPower (`21347`)
- Brick_SlimeSmash (`45166`)
- Brick_Solemn_Slap (`15417`)
- Brick_TMA (`19806`)

### `FIRE` · 7 players · separator

- FIRE_Aldo (`41891`)
- FIRE_arcy (`42117`)
- FIRE_CatusDC (`13529`)
- FIRE_Dalai Marco (`22230`)
- FIRE_ELPAPI (`11020`)
- FIRE_TigerAce (`29548`)
- FIRE_tmpeixer (`15217`)

### `GLW` · 7 players · separator

- GLW_BAP (`18640`)
- GLW_Cou (`32751`)
- GLW_Ika (`21385`)
- GLW_ManolOne (`71591`)
- GLW_Peppoloni (`21388`)
- GLW_Vampyro96 (`21467`)
- GLW_XIMOD (`18479`)

### `HEKA` · 7 players · bracket 4, separator 3

- [HEKA] Alex (`19082`)
- [HEKA] Florian (`20058`)
- [HEKA] JAX (`18462`)
- [HEKA] Morii (`20043`)
- Heka_--S-- (`25024`)
- HEKA_MadGenius (`67115`)
- HEKA_MicRo (`19151`)

### `HERO` · 7 players · bracket

- [HERO] DrnkalBychCoco (`20500`)
- [HERO] Ilidur (`31898`)
- [HERO] Inary (`22809`)
- [HERO] Linhartka (`18427`)
- [HERO] Megasonik (`19850`)
- [HERO] Rendolf (`13408`)
- [HERO] Sathran (`15720`)

### `IMB` · 7 players · separator

- IMB-Cursed_Drama (`10765`)
- IMB_Boltina (`21379`)
- IMB_Daneeko (`28826`)
- IMB_Joji (`10767`)
- IMB_MrPooh (`10320`)
- IMB_Nait Sirch (`28825`)
- IMB_Sakuragi (`21381`)

### `INKCROWS` · 7 players · separator

- InkCrows | Emberblossom (`11048`)
- InkCrows | Lars (`14300`)
- InkCrows | Laura (`26846`)
- InkCrows | Mansier (`70847`)
- InkCrows | Travolta (`189466`)
- InkCrows | Troa (`30852`)
- InkCrows | Xela (`18019`)

### `INP` · 7 players · space

- INP Alex (`36021`)
- INP AWPuppy (`36006`)
- INP Chrismas (`7732`)
- INP PartyMarty (`7374`)
- INP Rocky (`36631`)
- INP SnipingRooster (`6580`)
- INP Teresa (`36020`)

### `IR` · 7 players · separator 6, space 1

- IR Timesplitter56 (`30290`)
- IR_fiend (`7118`)
- IR_Figment (`44512`)
- IR_FwiZzii (`6597`)
- IR_JonnyBoy (`7747`)
- IR_krizz (`7994`)
- IR_Red Mamba (`31799`)

### `LM` · 7 players · separator

- LM_ALONS (`22342`)
- LM_Anam (`30360`)
- LM_Cetreth (`19155`)
- LM_MartINK (`20626`)
- LM_Novenaso (`13016`)
- LM_Sergio (`22340`)
- LM_Sofi (`22329`)

### `LORN` · 7 players · separator

- LorN_Antics (`18508`)
- LorN_Belpa (`20010`)
- LorN_KevinDL (`18570`)
- LorN_LemonsTree (`40296`)
- LorN_Lunatik (`26856`)
- LorN_Qwack (`18531`)
- LorN_solsdii (`19994`)

### `LSA` · 7 players · separator

- LSA | Geek Inside (`22545`)
- LSA | Gertjan B (`11603`)
- LSA | LoreDirector 🎬 (`33663`)
- LSA | LoreGiant (`21500`)
- LSA | LoreGoat 🐐 (`14657`)
- LSA | MaaikeyMarie (`22555`)
- LSA | Razberry (`22262`)

### `MH` · 7 players · bracket 6, separator 1

- [MH] AlbiePort (`10669`)
- [MH] Byron (`13713`)
- [MH] Cubby (`28371`)
- [MH] melaj (`13709`)
- [MH] Ozzie (`16674`)
- [MH]Ngenna (`13707`)
- MH-Shaun (`12001`)

### `MHL` · 7 players · bracket

- [MHL] Coffee (`35226`)
- [MHL] Le G (`10035`)
- [MHL] Mamzelle_cocotte_ (`9003`)
- [MHL] mouffy (`22309`)
- [MHL] Paresseux (`22217`)
- [MHL] Xorkz (`17286`)
- [MHL]Woolrick (`13879`)

### `MIK` · 7 players · separator

- MIK-Toffan (`13948`)
- MIK_BBowye (`13926`)
- MIK_ced_visno (`16542`)
- MIK_Kamikuro (`16240`)
- MIK_MIKA (`14319`)
- MIK_Nosh6 (`14338`)
- MIK_STrogue (`174797`)

### `OFA` · 7 players · separator 6, bracket 1

- [OFA] Pan (`44703`)
- OFA | Aimilia (`30436`)
- OFA | Chlohi (`20503`)
- OFA | Cinou (`21699`)
- OFA | Gaiflo (`15976`)
- OFA | LazySloth (`21515`)
- OFA | Raychaf (`34855`)

### `OTG` · 7 players · bracket

- [OTG] Arnaud (`196781`)
- [OTG] DDboy (`21529`)
- [OTG] kiryu36 (`38101`)
- [OTG] le grapin (`29691`)
- [OTG] Mimie (`21526`)
- [OTG] Rastafouille (`17730`)
- [OTG] Witching (`29683`)

### `OTP` · 7 players · space

- OTP EDWARD (`20407`)
- OTP Foolinabox (`20412`)
- OTP LifesPuzzle (`20409`)
- OTP Mike (`20410`)
- OTP NoobStick (`9925`)
- OTP Peaked In Seattle (`7782`)
- OTP Sivart (`37540`)

### `RD` · 7 players · space 6, separator 1

- RD Carballo (`9505`)
- RD Cowboy Tipo🐮 (`9410`)
- RD Javi A (`15645`)
- RD Joanitalulu (`50052`)
- RD Leinad 🦔 (`34447`)
- RD Ratatula (`9351`)
- RD_SergioAisa (`9494`)

### `RVL` · 7 players · separator

- RVL.steph711 (`33986`)
- RVL_Calle33 (`23677`)
- RVL_Cmdr.Laserstrahl (`34464`)
- RVL_CoReMi (`11322`)
- RVL_Flo (`11608`)
- RVL_Hannibal (`24276`)
- RVL_Tava (`26985`)

### `ST` · 7 players · separator

- ST_AlfredoBirbone (`10873`)
- ST_Gabbo95 (`8061`)
- ST_Karma00 (`18515`)
- ST_Mark93 (`21322`)
- ST_Pharias (`49105`)
- ST_Spacejam (`16415`)
- ST_Tronux (`18109`)

### `TS` · 7 players · separator

- TS_Alvaro 🫟 (`18470`)
- TS_Antonella 🫟 (`23573`)
- TS_Dani11 (`18473`)
- TS_Falconeti🫟 (`29898`)
- TS_Gallonet🍊 (`18476`)
- TS_Khoyac (`9523`)
- TS_RDurban (`9681`)

### `TU` · 7 players · bracket

- [TU] BenD.Vinci (`46913`)
- [TU] Dairino (`7287`)
- [TU] Don-Shimon (`7259`)
- [TU] Hofnarr (`9972`)
- [TU] KraX (`14346`)
- [TU] Marukro (`30745`)
- [TU] TintenPrinzessin (`9938`)

### `WG` · 7 players · separator

- WG_AJK (`242278`)
- WG_Ar Nic (`293370`)
- WG_BobbyLoveElsa (`64648`)
- WG_Charis (`252977`)
- WG_Cousin (`81249`)
- WG_Eddie (`61402`)
- WG_PunchFirst (`298394`)

### `ZTH` · 7 players · bracket

- [ZTH] Eelvee (`23098`)
- [ZTH] Gagalaxy (`28767`)
- [ZTH] Jul-E (`11253`)
- [ZTH] Kial (`20668`)
- [ZTH] mougli (`24407`)
- [ZTH] Pilou (`21512`)
- [ZTH] Popi (`28759`)

### `🌻` · 7 players · emoji

- 🌻 James Gray II (`21919`)
- 🌻Brohammington (`8940`)
- 🌻GabeGolfer (`10031`)
- 🌻Lykoss14 (`11994`)
- 🌻Questingqueentcg (`12821`)
- 🌻SFI-Amadeus (`40228`)
- 🌻Zane Gray (`22042`)

### `1+1` · 6 players · bracket

- [1+1] Fred (`11168`)
- [1+1]-Capsarie (`53376`)
- [1+1]-Cha (`21583`)
- [1+1]-Nilrouge (`15337`)
- [1+1]-Thorfinn (`205898`)
- [1+1]-Thorkell (`28827`)

### `4GOT` · 6 players · bracket

- [4GOT]LetsGoSki (`10856`)
- [4GOT]mevin (`15485`)
- [4GOT]Pakkia89 (`20523`)
- [4GOT]Riky27 (`15690`)
- [4GOT]SyMaAl (`15510`)
- [4GOT]Thortellino (`15521`)

### `BJK` · 6 players · bracket

- [BJK] Dragg (`23026`)
- [BJK] Faulk13 (`20871`)
- [BJK] Hebisuka (`22759`)
- [BJK] Jones (`22752`)
- [BJK] Mickedavra (`17505`)
- [BJK] Press_F (`28138`)

### `CLE` · 6 players · separator 5, space 1

- CLE - Karnage (`4629`)
- CLE Dr Kungpow (`8643`)
- CLE- SFPanz (`306057`)
- CLE_BoatSnack (`11087`)
- Cle_GriffyJ (`24574`)
- CLE_Mondy (`9977`)

### `COI` · 6 players · separator

- COI | duesentrieb (`72357`)
- COI | Granic (`12298`)
- COI | MVPi (`72358`)
- COI | Royal (`15517`)
- COI | Suminy (`12034`)
- COI | Tateurndinaocellicauda (`36899`)

### `DD` · 6 players · separator

- DD_Adrián C. (`23533`)
- DD_EzioMaya (`9578`)
- DD_Hydro (`9571`)
- DD_JaviRM11 (`9599`)
- DD_Klabitos (`25248`)
- DD_Menguexe (`25249`)

### `ESTA` · 6 players · separator

- ESTA_Dreaddy_974 (`75473`)
- ESTA_Elegna (`89760`)
- ESTA_Matt_DK (`39241`)
- ESTA_Shadou (`75393`)
- ESTA_tiiiigrou (`78169`)
- ESTA_Toto_B (`75805`)

### `GH` · 6 players · bracket

- [GH] Hoplit (`19835`)
- [GH] JM (`42062`)
- [GH] Krytton (`39665`)
- [GH] Kubqo (`7295`)
- [GH] Raphael (`25044`)
- [GH] Zrzoun (`25045`)

### `GPL` · 6 players · bracket

- [GPL] Crusty 🇵🇱 🏔️ (`27669`)
- [GPL] EvilBunny 🇵🇱🏔️ (`32736`)
- [GPL] GRUWSKI (`9374`)
- [GPL] J4kubb 🇵🇱 🏔️ (`15136`)
- [GPL] jwrobel (`41930`)
- [GPL] Lorasyko (`29869`)

### `IKT` · 6 players · separator

- IKT_Ghiotto86 (`10092`)
- IKT_GianlucaR (`18541`)
- IKT_Inkegno (`10082`)
- IKT_Link185 (`30919`)
- IKT_Nobody22 (`18580`)
- IKT_UncleP (`18649`)

### `IMG` · 6 players · separator

- IMG_Angelblanco2 (`27636`)
- IMG_Carles (`45184`)
- IMG_Davidmf55 (`27938`)
- IMG_Indis (`27674`)
- IMG_Jordip21 (`9673`)
- IMG_Systox (`18592`)

### `JFT` · 6 players · separator

- JFT_ Genny D Sauro (`19398`)
- JFT_Ar3s_94 (`18713`)
- JFT_Beatrix (`20152`)
- JFT_Gabriel679 (`19345`)
- JFT_Giankqwerty (`18636`)
- JFT_xLuffy (`18646`)

### `LAG` · 6 players · separator

- LAG_Albius (`188019`)
- LAG_Aleksi (`188020`)
- LAG_Captain-SaraZin (`200601`)
- LAG_Nyshae (`220487`)
- LAG_Talysanne (`33414`)
- LAG_Zango (`16069`)

### `LBC` · 6 players · bracket

- [LBC] Dedogawa (`16405`)
- [LBC] Geo (`17643`)
- [LBC] Klelyah (`17136`)
- [LBC] Marichat (`16010`)
- [LBC] Serguei (`15333`)
- [LBC] Wanderer (`18442`)

### `LCFT` · 6 players · bracket

- [LCFT] Daokwan (`17464`)
- [LCFT] Guizmo (`244770`)
- [LCFT] Mega_Duck (`17468`)
- [LCFT] MisterJordy (`17218`)
- [LCFT] Sparrow (`29265`)
- [LCFT] Tiranyth (`22050`)

### `LRD` · 6 players · bracket

- [LRD] AlexisMoc (`15965`)
- [LRD] Bahdin (`22075`)
- [LRD] Leink (`11776`)
- [LRD] LorcaDlp (`13920`)
- [LRD] Obeyron (`18653`)
- [LRD] r0ppongi (`13925`)

### `MAGMA` · 6 players · bracket

- [magma] barruda (`406851`)
- [magma] barruda (`240199`)
- [Magma] Bosca (`240640`)
- [Magma] Hanna (`235546`)
- [Magma] Henry Sauer (`246804`)
- [Magma] marselo (`210388`)

### `META` · 6 players · bracket

- [Meta] - Mathieu (`34250`)
- [META] Bobstache (`10465`)
- [META] Capitaine Line (`43821`)
- [META] ClaraEvenstar (`18858`)
- [META] Lassema (`20575`)
- [META] Tidoublou (`30131`)

### `MI` · 6 players · separator 4, bracket 2

- [MI] Prisman (`13202`)
- [MI]Tsuruchy (`45917`)
- MI | Dustin (`11930`)
- MI | Mantelrog (`25017`)
- MI | Nathalie:) (`13937`)
- Mi_Amor 91 (`44172`)

### `NLO` · 6 players · separator 5, space 1

- nLo - HausenDan (`8373`)
- nLo - Jeremy Walker (`7841`)
- NLO Bandito (`36976`)
- nLo- Pancho Romero (`14613`)
- nlo-Jinx Shame (`11785`)
- nLo-Ominoushorizon (`6838`)

### `P&A` · 6 players · separator

- P&A_ B100 (`9459`)
- P&A_Jan (`12915`)
- P&A_Michael (`9399`)
- P&A_Michiel (`9143`)
- P&A_Tom (`9377`)
- P&A_Wout (`7523`)

### `RNK` · 6 players · separator

- RnK_Damatoa (`2936`)
- RnK_DonKrys76 (`13614`)
- RnK_Ino (`9121`)
- RnK_Lexou (`44381`)
- RnK_Nando (`9112`)
- RnK_Shipes (`233267`)

### `RTG` · 6 players · separator

- RTG_Cri-Kee (`213469`)
- RTG_fidget (`29965`)
- RTG_Harlock (`45226`)
- RTG_Mushu (`213471`)
- RTG_Snow (`213459`)
- RTG_Squall (`213458`)

### `TCB` · 6 players · separator

- TCB | JohnnyBravo (`28306`)
- TCB | Kin Wang (`9237`)
- TCB | Lianne 🐒 (`8861`)
- TCB | MisterT (`13984`)
- TCB | Robon12 (`30151`)
- TCB | WhiteWarlock (`9095`)

### `TDM` · 6 players · separator 4, bracket 2

- [TDM] on100fou (`11003`)
- [TDM] Valmonzo (`21435`)
- TDM_CaptainTSR (`21420`)
- TDM_JustFlow (`21348`)
- TDM_Pat18 (`19918`)
- TDM_Tatlju (`29735`)

### `TDT` · 6 players · bracket

- 《TDT》 CookieChief (`7140`)
- 《TDT》Aibala (`33799`)
- 《TDT》BigBroBert (`7492`)
- 《TDT》E-Rod (`7225`)
- 《TDT》Gee (`28183`)
- 《TDT》Marce1o (`17226`)

### `TEAM OLYMPUS` · 6 players · trailing

- ☀️Apollo☀️ - Team Olympus (`54243`)
- ⚔️  Ares  ⚔️  - Team Olympus (`20225`)
- ⚡️Zeus⚡️ - Team Olympus (`7971`)
- 👷🏻‍Hephaestus - Team Olympus (`62125`)
- 🔥Hadez🔥 - Team Olympus (`35569`)
- 🔱Gnasher🔱 - Team Olympus (`39543`)

### `THLUP` · 6 players · separator

- THLUP_Chesterr37 (`14810`)
- THLUP_Duche (`18110`)
- THLUP_ElPrincipe22 (`30193`)
- THLUP_KebabbaroMan (`12938`)
- THLUP_Montegreen37 (`30196`)
- THLUP_Sbot (`13476`)

### `TLD` · 6 players · separator

- TLD_Grootus (`66246`)
- TLD_Harold (`66774`)
- TLD_NeverBored (`6524`)
- TLD_Smillie 😊 (`7028`)
- TLD_Urshquake (`44152`)
- TLD_Yirdboy (`19897`)

### `TNP` · 6 players · separator

- TNP_ArthurP (`29450`)
- TNP_ChaosAJ (`279797`)
- TNP_Lego (`35054`)
- TNP_Medievh (`52023`)
- TNP_NickBerthold (`35043`)
- TNP_OGKOLO (`34482`)

### `TNT` · 6 players · separator

- TNT_CasiY (`19216`)
- TNT_Katikato (`18563`)
- TNT_Lenandros (`9526`)
- TNT_LilSaint (`43592`)
- TNT_Shadowbroken (`16347`)
- TNT_SkaxyLin (`15581`)

### `TPM` · 6 players · separator

- TPM_Colin (`7649`)
- TPM_james🐉 (`8570`)
- TPM_KELEIGH (`8161`)
- TPM_Ryan (`12381`)
- TPM_Seer 🥸 (`7978`)
- TPM_Tyler (`7916`)

### `TZ` · 6 players · bracket

- [TZ] Gab Soares (`37089`)
- [TZ] Lari Rosa (`75845`)
- [TZ] Maju Souza (`74756`)
- [TZ] Renan Reis (`75846`)
- [TZ] Revill (`406854`)
- [TZ]Rufino (`323009`)

### `UNK` · 6 players · separator

- UNK_DrInvsble (`15800`)
- UNK_Frogmite (`25175`)
- UNK_Roderick (`31770`)
- UNK_SherLocked (`11172`)
- UNK_Simo9255 (`15436`)
- UNK_ZioPeppe (`15395`)

### `UTOPIA` · 6 players · bracket

- [UTOPIA] Courtis (`349871`)
- [UTOPIA] JustMax (`64659`)
- [UTOPIA] Kaarya (`38390`)
- [Utopia] Max (`18200`)
- [UTOPIA] Prestige (`9439`)
- [UTOPIA] Ragemo (`10762`)

### `WRD` · 6 players · bracket

- [WRD] Catane (`27910`)
- [WRD] Eawane (`29081`)
- [WRD] FreddyMelcurry (`16692`)
- [WRD] Gedeon Platypus (`17678`)
- [WRD] Tom Decker (`16430`)
- [WRD]Drocart (`29090`)

### `ZFG` · 6 players · separator

- ZFG_Agus🎲🍀 (`18014`)
- ZFG_Angeluqui622 (`9540`)
- ZFG_CarolxP (`25129`)
- ZFG_Ebbrei (`15854`)
- ZFG_Er Mario (`45663`)
- ZFG_Irenitch (`21313`)

### `🌊` · 6 players · emoji

- 🌊 [IW] Matt 🌊 (`16121`)
- 🌊 [IW] Riatna 🌊 (`33795`)
- 🌊 [IW] Slydenfox 🌊 (`17142`)
- 🌊 [IW] Smilecaro 🌊 (`26937`)
- 🌊[IW] Klougue🌊 (`17340`)
- 🌊[IW] Wecbonbon 🌊 (`17341`)

### `AWNM` · 5 players · separator

- AWNM-Jordy93 (`12265`)
- AWNM_Julian.S (`9248`)
- AWNM_Ruud (`14461`)
- AWNM_Stephanie (`6395`)
- AWNM_Wesley (`9278`)

### `B3T` · 5 players · separator

- B3T_Adkadi (`27642`)
- B3T_Alqui (`41074`)
- B3T_Cuchillo McCapri (`33573`)
- B3T_DavidDAVE (`9657`)
- B3T_Dr_Alfalfa (`45680`)

### `BB` · 5 players · separator

- BB_Biondo96 (`30054`)
- BB_Lollocast (`32726`)
- BB_Manfro (`31181`)
- BB_pedrante (`29737`)
- BB_SadDitto (`25219`)

### `BDL` · 5 players · separator

- BDL - Frizouille (`30140`)
- BDL - GrumpyDam (`16182`)
- BDL - Julie Mélomane aigüe (`30341`)
- BDL - MattSparrow (`52558`)
- BDL - Peps (`62037`)

### `BRXL` · 5 players · separator

- BRXL_Ceccop (`15321`)
- BRXL_Ellipanda (`20156`)
- BRXL_enricopelo (`13939`)
- BRXL_JMorrison (`15351`)
- BRXL_MirkoZanelli (`42053`)

### `CAPIVALORE` · 5 players · bracket

- [CapivaLore] baN (`231185`)
- [CapivaLore] Jobim (`263338`)
- [CapivaLore] Lord Kaio (`229567`)
- [CapivaLore] magRen (`55062`)
- [CapivaLore] ZinrooT (`185714`)

### `FTL` · 5 players · separator 4, bracket 1

- [FTL]  Azarias_FFC  🟢⚪️🔴 (`76054`)
- FTL - Morthemer (`17309`)
- FTL-Dyzoo (`28831`)
- FTL-Magnas (`214176`)
- FTL-Revih (`13493`)

### `GTCG` · 5 players · separator

- GTCG.Aleks (`311709`)
- GTCG.Bardacado (`23875`)
- GTCG.BAZONGKI (`8465`)
- GTCG.Samgyupsal (`192682`)
- GTCG.Sher (`65972`)

### `HL` · 5 players · space 3, separator 2

- HL Chhunbucket (`19040`)
- HL Desante (`8918`)
- HL McScoops (`8897`)
- HL_eRaycer (`8876`)
- HL_Goloume (`10732`)

### `HSC` · 5 players · space

- HSC Bjorn Gave Me His Foils (`9470`)
- HSC Elise (`44463`)
- HSC Shibby ☠️ (`36272`)
- HSC TeemoEnjoyer (`7694`)
- HSC Zomosis (`19753`)

### `IF` · 5 players · bracket

- [IF] ALLP1635 (`8585`)
- [IF] Bonefolder (`8748`)
- [IF] Ziggy (`8867`)
- [IF]KnightA (`7279`)
- [IF]Listengoodt (`34006`)

### `ILM` · 5 players · separator

- ILM_Bonkers (`18258`)
- ILM_Cocobalt (`16616`)
- ILM_FoMD (`28997`)
- ILM_kikoff (`30119`)
- ILM_Noelyn (`30118`)

### `INKR` · 5 players · bracket

- [INKR]Balma (`238454`)
- [INKR]Choupy (`263087`)
- [INKR]Khalimdar (`48975`)
- [INKR]Mijole (`49095`)
- [INKR]Valette (`42223`)

### `KKP` · 5 players · separator

- KKP_BabaYaga (`45909`)
- KKP_MrBomb (`27615`)
- KKP_RaZeRPaT (`35007`)
- KKP_Sternhai (`36881`)
- KKP_ThaKing (`45750`)

### `KONG` · 5 players · separator 4, space 1

- KONG SIEW LOON (`406747`)
- KONG_Breegos (`35646`)
- KONG_Fulci (`9594`)
- KONG_indeciso (`37606`)
- KONG_vecchialarm (`15456`)

### `LD1` · 5 players · separator

- LD1_ANVILDEVIL (`18127`)
- LD1_Fryze998 (`281401`)
- LD1_Grandepuffo65 (`18137`)
- LD1_MACS (`18130`)
- LD1_Swigo (`18133`)

### `NVR` · 5 players · separator

- Nvr | NvrGunnaStop(Mark) (`8036`)
- NVR_44lvarado (`28928`)
- NVR_AlphaJBO (`7388`)
- NVR_Azure (`7477`)
- NVR_Taris (`7402`)

### `PB` · 5 players · separator

- PB_Bellalv (`19207`)
- PB_Rorxs (`20036`)
- PB_Samai (`55668`)
- PB_SANS_BRG (`44133`)
- PB_Timo (`20037`)

### `RDP` · 5 players · separator

- RdP_$crooge (`9077`)
- RdP_Ashley (`13785`)
- RdP_Danner (`9127`)
- RdP_Seomann (`30750`)
- RdP_Tobi (`7305`)

### `RFT` · 5 players · separator

- RFT_Blitz (`37788`)
- RFT_Haviix (`14567`)
- RFT_Huayra (`35957`)
- RFT_Link (`15069`)
- RFT_Sparky (`18227`)

### `SB` · 5 players · separator

- SB-Captain Sharkboy (`29097`)
- SB_Lexaluxis (`10041`)
- SB_Morcana (`65778`)
- sb_peitsche (`4944`)
- SB_Volkmar (`12280`)

### `SNS` · 5 players · bracket

- [SnS] Johrel (`7290`)
- [SnS] KingKang (`8190`)
- [SnS] momotaro (`8578`)
- [SnS] muu (`7283`)
- [SnS] plainsy (`7976`)

### `SPX` · 5 players · separator

- SPX | flyingphoenix (`13841`)
- SPX | Ice Sorcerer (`188757`)
- SPX | Kifez (`65490`)
- SPX | knoelg (`20170`)
- SPX | Seretim (`13840`)

### `TEAM MUSES` · 5 players · trailing

- Ashley M - Team Muses (`43763`)
- Brandon Richards - Team Muses (`54531`)
- Brandon Richards - Team Muses (`33313`)
- Brittany Robertson-Team Muses (`6462`)
- Mikey B. - Team Muses (`10235`)

### `TEAMKA` · 5 players · separator

- TeamKA.BKM.PuffBite (`416731`)
- TeamKA.ICON.FishGod (`416722`)
- TeamKA.QUEST·倾人城 (`191901`)
- TeamKA.TopDeck (`218561`)
- TeamKA.XiaoMage (`14089`)

### `TGN` · 5 players · bracket

- [TGN] Capt_C4RN4GE (`24028`)
- [TGN] DOMCRIT (`39439`)
- [TGN] KazNatBabs (`36672`)
- [TGN] Riceman (`36448`)
- [TGN] Turdinator135 (`104763`)

### `VGL` · 5 players · separator

- VGL_albamustaine (`22780`)
- VGL_Arepiita (`35044`)
- VGL_Criz (`262987`)
- VGL_Darius (`22046`)
- VGL_Yutuf (`11019`)

### `WNK` · 5 players · separator

- WnK_Damanubis (`15272`)
- WnK_Ketchup (`44355`)
- WnK_Mhaaze (`24162`)
- WnK_Onyht (`23335`)
- WnK_SilmaLoth (`24168`)

## Teams with 3–4 players

### `ATTQ` · 4 players · bracket

- [ATTQ] Geezy (`27483`)
- [ATTQ] KingKwong (`55372`)
- [ATTQ] Solomungrundy (`33383`)
- [ATTQ] Wahkeen (`10561`)

### `AVJ` · 4 players · bracket

- [AvJ] Flo86 (`48863`)
- [AvJ] Jeh (`12207`)
- [AvJ] Juju (`85559`)
- [AvJ] RinZleR (`214841`)

### `CG` · 4 players · bracket

- [CG] Annilatac (`271926`)
- [CG] Mackroz (`271779`)
- [CG]BaconStripsCL (`265940`)
- [CG]Jackpot (`256770`)

### `CMI` · 4 players · bracket

- [CMI] Crazylegzs (`11275`)
- [CMI] Feeahlix (`30255`)
- [CMI] Tarzan77 (`9772`)
- [CMI] trllvll (`59104`)

### `EDA` · 4 players · bracket 2, separator 2

- [EDA] Evomimi (`25215`)
- [EDA] Hardkil (`25208`)
- EDA-EroSenin (`24849`)
- EDA-SPARDA (`27177`)

### `EMP` · 4 players · separator

- EMP_Chapuzas (`7117`)
- EMP_EliSeven (`9696`)
- EMP_Neo (`9753`)
- EMP_onlybyalba (`14196`)

### `ETB` · 4 players · space

- ETB Adrian (`16049`)
- ETB Games Nick (`1752`)
- ETB Kris (`8752`)
- ETB Riley (`10002`)

### `FBS` · 4 players · bracket 2, separator 2

- [FBS] Bentbranch (`29796`)
- [FBS] Wreck It Rob (`37004`)
- FBS | Fenix (`66152`)
- FBS | Jenny (`29234`)

### `FL` · 4 players · separator

- FL-Damon (`242287`)
- FL-Rocky (`70812`)
- FL-rui (`242285`)
- FL-Yuffie (`242288`)

### `GCF` · 4 players · separator

- GCF _ Marjo (`40303`)
- GCF_Adwon (`34446`)
- GCF_Aenarian (`27018`)
- GCF_Foxy (`27550`)

### `HS` · 4 players · bracket

- [HS] CINDER (`19906`)
- [HS] Magicarpaccio (`196819`)
- [HS] YoDa (`19954`)
- [HS]Mjoolnir (`20085`)

### `IAB` · 4 players · bracket

- [IAB]  Manu 🪐 (`31038`)
- [IAB] 6d2 🧨 (`21630`)
- [IAB] Dudels (`15634`)
- [IAB] Norii08 🌟 (`21632`)

### `ICW` · 4 players · space

- ICW Mascarale (`9606`)
- ICW Miss Shiny ✨ (`9445`)
- ICW PulsoD (`23008`)
- ICW Silthrim95 (`9941`)

### `IDK` · 4 players · bracket

- [IDK] Hitorit 🇵🇱🏔 (`18448`)
- [IDK] simograj 🇵🇱🏔️ (`34893`)
- [IDK] timhalf (`37796`)
- [IDK] Yao (`139767`)

### `IHT` · 4 players · separator

- IHT_AleMangiu (`30967`)
- IHT_Alessandro Danesi (`22772`)
- IHT_Michele_Carretta (`29739`)
- IHT_Pivox (`9631`)

### `IMP` · 4 players · separator

- IMP - Smpcavery (`14422`)
- IMP_AllesDrinAusserWin (`22283`)
- IMP_Kyoshi (`8131`)
- IMP_VelvetMamba (`38636`)

### `INK PASS` · 4 players · bracket

- [Ink Pass] Daniel T (`8790`)
- [Ink Pass] iVSlime (`10317`)
- [Ink Pass] Lawcana (`8013`)
- [Ink Pass] LegendGary (`7165`)

### `INKS` · 4 players · separator

- INKS_Bunnypun (`9088`)
- INKS_Der_Vierte_Hokage (`71329`)
- INKS_LaikaS (`14295`)
- INKS_THOENNESSTEIN (`20542`)

### `IQ` · 4 players · bracket

- [IQ] AxisLouie (`79171`)
- [IQ] Darkmouse21 (`35440`)
- [IQ]Daniel Reid (`50404`)
- [IQ]Herbs (`36766`)

### `KNY` · 4 players · bracket

- [KNY] Canaillou 🐥 (`27737`)
- [KNY] FGMarius 🐥 (`37698`)
- [KNY] Margotine 🐥 (`73133`)
- [KNY] Seyfert (`48998`)

### `LIK` · 4 players · separator

- LiK_Little (`12630`)
- Lik_Qu3lQu1 (`24164`)
- LiK_Shin (`15311`)
- LiK_Snowletz (`23703`)

### `LOL` · 4 players · separator

- LoL_KatCrits (`6564`)
- LoL_Kazii (`6429`)
- LoL_RascalAddams (`55263`)
- LoL_ScroogeTheRulez (`19000`)

### `LOTL` · 4 players · separator

- LOTL_Brakandaran (`10145`)
- LOTL_NicRone (`10165`)
- LOTL_sKleene (`10143`)
- LOTL_Vereck92 (`10159`)

### `MGG` · 4 players · separator 3, space 1

- MGG Maxing (`20809`)
- MGG | ruFFy (`20177`)
- MGG | Severin (`20192`)
- MGG | ZenTerra (`8115`)

### `MKB` · 4 players · separator 3, space 1

- MKB Smoxie (`28559`)
- MKB_ben (`34847`)
- MKB_Revan (`42654`)
- MKB_Tom (`17245`)

### `ML` · 4 players · separator

- ML_Bombocards (`18538`)
- ML_Irenecus (`18540`)
- ML_Morientes (`25223`)
- ML_TaiyoNoKoori (`14762`)

### `MMC` · 4 players · bracket

- [MMC] Azura (`11666`)
- [MMC] Azura (`30849`)
- [MMC] La Melio (`19344`)
- [MMC] xavounette (`30882`)

### `NZK` · 4 players · separator

- NZK_Angel alvarez (`39924`)
- NZK_Lucena (`35850`)
- NZK_SirTorne (`9567`)
- NZK_Wirry (`228161`)

### `OZM` · 4 players · separator

- OZM_Elbobicar (`21548`)
- OZM_Elpiks (`41896`)
- OZM_Thalos (`21550`)
- OZM_Throkx (`21549`)

### `PYFS` · 4 players · separator

- PYFS_ItsMeJay (`19611`)
- PYFS_Lumen (`10729`)
- PYFS_MCHammer (`245534`)
- PYFS_UnQuackAbleWill (`32017`)

### `Q2W` · 4 players · bracket 2, trailing 1, space 1

- [Q2W] JajoKlek (`106696`)
- [Q2w] Pokes 🔛🔝🔜 (`31907`)
- FEROLIND [Q2W] (`39504`)
- Q2W Frycio🔛🔝🔜 (`9125`)

### `RR` · 4 players · separator

- RR_Latzenaugust (`55516`)
- RR_Reyem (`75424`)
- RR_SlavicBOYYY (`38773`)
- RR_Vhaleru (`21363`)

### `RSG` · 4 players · space 3, bracket 1

- (RSG) Truck-kun (`27492`)
- RSG Anatidae (`8463`)
- RSG Chilla (`7112`)
- RSG Free (`27493`)

### `RSR` · 4 players · separator

- RSR - DisneyDreamer (`21670`)
- RSR - Ferkalicious (`37528`)
- RSR - Kingsbury (`89699`)
- RSR-GGoliath (`39653`)

### `SGS` · 4 players · separator

- SGS_Bigdogbourne (`8982`)
- SGS_ETHAN P (`19004`)
- SGS_Lecky (`16436`)
- SGS_NICO (`7299`)

### `SM` · 4 players · separator

- SM_Guido (`22311`)
- SM_J (`52742`)
- SM_Luke (`51828`)
- SM_Timo (`51945`)

### `TEAMBROKE` · 4 players · trailing

- Deirdree🌹《TeamBroke》 (`175132`)
- Nikazzz  🍀《TeamBroke 》 (`74563`)
- Tom Shō《TeamBroke》 (`175138`)
- 🦈Kenny c. 《 TeamBroke 》 (`30960`)

### `TEAMDEVYLDER` · 4 players · separator

- TeamDeVylder_Bianca (`176678`)
- TeamDeVylder_Esther (`177371`)
- TeamDeVylder_Geert (`161948`)
- TeamDeVylder_Nathan (`177396`)

### `TST` · 4 players · bracket

- [TST] FrancescoTottiBiascica (`13156`)
- [TST] Nico (`28073`)
- [TST]Alessio Di Lorenzo (`214918`)
- [TST]CostaBabyBoy (`14628`)

### `TXC` · 4 players · separator 3, space 1

- TXC Adrián Iñigo (`35921`)
- TXC_Borjon (`51937`)
- TXC_Lukiluki (`27806`)
- TXC_Squirtle (`24330`)

### `URI` · 4 players · bracket

- [Uri] DarlaLH (`43926`)
- [Uri] WinstonDH (`43918`)
- [Uri]Sarielle (`10182`)
- [Uri]Zappy (`12257`)

### `UTS` · 4 players · bracket

- [UTS] Drien71 (`26915`)
- [UTS] Sauleane 🌊 (`26998`)
- [UTS] 🚀SpaceRanger 🌊 (`24347`)
- [UTS]🐒TiltMonkey🌊 (`16145`)

### `ZZZ` · 4 players · bracket

- (ZzZ) black sun zenith (`50904`)
- (ZzZ) Sunshine (`50899`)
- (ZzZ)Engelous (`16888`)
- (ZzZ)Snoracana_Gary (`17686`)

### `⚡` · 4 players · emoji

- ⚡Inkpactruenada⚡anne (`36967`)
- ⚡Inkpactruenada⚡Kiddo91 (`15726`)
- ⚡Inkpactruenada⚡nuriacp (`25241`)
- ⚡Inkpactruenada⚡wicca (`19466`)

### `🚫🖋️` · 4 players · emoji

- 🚫🖋️ JCho (`27489`)
- 🚫🖋️Briguy (`12335`)
- 🚫🖋️dopa (`84688`)
- 🚫🖋️Q (`14586`)

### `007` · 3 players · separator

- 007_Bisca (`28967`)
- 007_Nbrio4🧪 (`35092`)
- 007_Yrian92 (`36308`)

### `BM` · 3 players · separator

- BM-ChrisCaptain (`18812`)
- BM-Squall (`18654`)
- BM-Weib (`15578`)

### `BS` · 3 players · bracket

- [BS] Hextra (`31959`)
- [BS] JustFindus (`52887`)
- [BS] Kwaif (`267374`)

### `CBG` · 3 players · bracket

- [CBG] Edwin (`35537`)
- [CBG] Hangry Illumineer (`12177`)
- [CBG] Im_the_problem (`11906`)

### `DRGN` · 3 players · separator

- DRGN_LiamR (`74855`)
- DRGN_Sleepybrownzzz (`7421`)
- DRGN_Treeknocker (`8985`)

### `ENV` · 3 players · trailing

- AWholeNewQuest [ENV] (`17295`)
- Incubus828 [ENV] (`75374`)
- VillainArc [ENV] (`7923`)

### `FDAB` · 3 players · separator

- FDAB_IsraelPR (`36950`)
- FDAB_Jaescry (`27079`)
- FDAB_Mario Saruman (`37909`)

### `FF` · 3 players · bracket 2, separator 1

- [FF]Rainbowsky (`11416`)
- [FF]Tomate_Detective (`18845`)
- FF_Nyarla (`66889`)

### `FG` · 3 players · bracket 2, separator 1

- [FG] NaroSniper (`49921`)
- [FG] Rocielle (`72300`)
- FG_Ottomatic (`31441`)

### `FUN` · 3 players · separator

- FUN | Catwington (`15789`)
- FUN | ruciane (`14407`)
- FUN | Vanessa (`14418`)

### `GLI INKREDIBILI TEAM` · 3 players · trailing

- Gabpass (Gli Inkredibili Team) (`363383`)
- Marsili (Gli Inkredibili Team) (`34988`)
- Mica (Gli Inkredibili Team) (`184714`)

### `GRD` · 3 players · bracket

- [GRD] Alex (`196874`)
- [GRD] Hestileos (`17565`)
- [GRD] Hoto (`23974`)

### `HOTC` · 3 players · separator

- HOTC_AnngelBomb (`21430`)
- HOTC_GGFate (`6970`)
- HOTC_Matp05 (`21439`)

### `ID` · 3 players · separator

- ID | RavenAnxy (`7268`)
- ID | Snowstorm (`9173`)
- ID_Messerscharf (`8207`)

### `INK45` · 3 players · separator

- Ink45_Ecko (`19266`)
- Ink45_Patze (`18576`)
- Ink45_Timo214 (`19173`)

### `INKCSTR` · 3 players · separator

- INKCSTR_Albert (`11657`)
- INKCSTR_JReyes (`13885`)
- INKCSTR_NixonC (`11576`)

### `INKREDIBLES` · 3 players · trailing

- Laura Ryan (Inkredibles) (`50014`)
- Mdskeeper (Inkredibles) (`60990`)
- Salabama724 (Inkredibles) (`39497`)

### `KEEP7` · 3 players · separator

- Keep7_Ben (`20836`)
- Keep7_Meltiac (`20084`)
- Keep7_Strahlemann0815 (`20044`)

### `LCI` · 3 players · separator

- LCI_Danny (`9160`)
- LCI_Geert (`9152`)
- LCI_Zai (`28666`)

### `LCN` · 3 players · separator 2, bracket 1

- lcn_muffin (`31976`)
- LCN_UniSushi (`14420`)
- 【LCN】一撮毛 (`458570`)

### `LDSF` · 3 players · separator

- LDSF_Jerem (`27073`)
- LDSF_Ptitbiscuits (`34573`)
- LDSF_Vixdenice (`33519`)

### `LEGENDARYS` · 3 players · separator

- Legendarys_eca999 (`236128`)
- Legendarys_Erik perez (`155180`)
- Legendarys_Ismael Pérez (`32673`)

### `LH` · 3 players · bracket 2, space 1

- [LH] JustinCapable (`42461`)
- [LH] Uncool Sam 🔥 (`6584`)
- LH Atoke (`9655`)

### `LTD` · 3 players · separator

- LTD_Kreepo (`3574`)
- LTD_Kreepo (`10043`)
- LTD_Yilmaz (`8715`)

### `LUCHALORES` · 3 players · separator

- LuchaLores_Adam (`6570`)
- LuchaLores_NotVicki (`23113`)
- LuchaLores_Skyguy (`6696`)

### `MA` · 3 players · bracket

- [MA] Dioneso (`20247`)
- [MA] Eko (`34820`)
- [MA] manuSDF (`34345`)

### `MATT` · 3 players · separator 2, trailing 1

- CrimsonWraith (Matt) (`8642`)
- Matt - (Matthias) (`32524`)
- Matt_A (`6370`)

### `MGL` · 3 players · space

- MGL Ares (`182146`)
- MGL Daneal (`68841`)
- MGL Ukiyo (`154036`)

### `MHM` · 3 players · bracket

- (MHM) KK (`203433`)
- (MHM) Svking (`10588`)
- [MHM] TAOxEaglex (`318380`)

### `MQ` · 3 players · separator

- MQ_Bjoern (`15379`)
- MQ_Simone (`14456`)
- MQ_ZiegenBock (`20633`)

### `MXR` · 3 players · separator

- MXR_Jazib/Davy (`11647`)
- MXR_Nety (`14398`)
- MXR_Oggar (`6771`)

### `NAGA` · 3 players · bracket

- [NAGA] Ashball (`21577`)
- [NAGA] Shâmundâ (`10392`)
- [NAGA] Xenomax (`10394`)

### `NC` · 3 players · bracket 1, space 1, separator 1

- [NC] - Francisco 🇧🇷 (`72047`)
- NC Math95 (`17874`)
- NC_Jowelle (`19230`)

### `NLGD` · 3 players · separator

- NLGD_AK_Mario (`11186`)
- NLGD_Baker (`32425`)
- NLGD_DAVS53 (`12923`)

### `NTCG` · 3 players · separator

- NTCG_Demien (`22611`)
- NTCG_Fredy (`34720`)
- NTCG_Lynna (`9842`)

### `OD` · 3 players · bracket

- [OD] BlackNox 🐙 (`4150`)
- [OD] Brindacier (`17622`)
- [OD] Mimi 🐙 (`17586`)

### `OPL` · 3 players · bracket

- [OPL] MaryMaryline (`30121`)
- [OPL] Saikane (`9049`)
- [OPL] Spoutnik (`7637`)

### `POTATO` · 3 players · bracket

- [POTATO] @marcos_lorcana (`21611`)
- [POTATO] Elenafg (`21501`)
- [POTATO] The Loot Lair -Martin (`25100`)

### `PPL` · 3 players · separator

- PPL - Manely67 (`15497`)
- PPL-Atsio (`23456`)
- PPL-Kssksss67 (`16051`)

### `QDIT` · 3 players · separator

- QDIT_Krapfen9 (`13804`)
- QDIT_SissrhEl (`41830`)
- QDIT_SissrhEl (`12274`)

### `QIP` · 3 players · separator

- QiP_Euro9000 (`18154`)
- QiP_Madara (`30720`)
- QiP_Nephentes (`284514`)

### `RESERVA` · 3 players · bracket

- [Reserva] Cleber (`313912`)
- [Reserva] Murilanches (`398944`)
- [Reserva]Rafael (`275601`)

### `RTB` · 3 players · separator

- RtB_Bommel (`60380`)
- RtB_Knappe (`30313`)
- RtB_Yixx (`37641`)

### `SADDOG` · 3 players · separator

- SadDog_Franklin (`17717`)
- Saddog_Soulman2166 (`16273`)
- SadDog_Wesley (`37809`)

### `SH` · 3 players · bracket 1, trailing 1, space 1

- (SH)Lishabug (`36482`)
- HeyHeyRawn (SH) (`6442`)
- SH LIN (`65659`)

### `SPRK` · 3 players · separator

- SPRK_Biffi (`9735`)
- SPRK_Kimeira (`10947`)
- SPRK_Xelta (`10104`)

### `SRC` · 3 players · trailing 2, separator 1

- Alexa[SRC] (`20387`)
- Diabeto88[SRC] (`20386`)
- SRC_Hopps (`224125`)

### `TAL` · 3 players · separator

- TaL_CiaoKakao (`24850`)
- TaL_helios42u (`61328`)
- TaL_Sonarya (`65483`)

### `TEAM PERFECT CURVE` · 3 players · trailing

- fradotato (Team Perfect Curve) (`29914`)
- HybridLP08 (Team Perfect Curve) (`37632`)
- It’sBrittanyBetch (Team Perfect Curve) (`50456`)

### `TEAMGF` · 3 players · bracket

- [TeamGF]-Ivy (`22155`)
- [TeamGF]-LorKhan (`16287`)
- [TeamGF]-Lyserg (`12963`)

### `TGUY` · 3 players · separator

- TGuy_cesu (`79795`)
- TGuy_itsroserade (`68976`)
- TGuy_KingJ (`69240`)

### `TK` · 3 players · separator 2, space 1

- TK - Vaasbrause (`39378`)
- TK - Xabbu (`75502`)
- TK Yii (`28712`)

### `TMSP` · 3 players · trailing

- BreM8 (TMSP) (`31459`)
- Hoodworks (TMSP) (`350901`)
- JGSali (TMSP) (`9764`)

### `TSI` · 3 players · separator 2, space 1

- TSI Tsubasa (`20790`)
- TSI-SnK (`20701`)
- TSI_Itah (`10783`)

### `TSP` · 3 players · bracket

- [TSP] Healion (`271857`)
- [TSP] misbounce (`265904`)
- [TSP] Vermillion (`271789`)

### `TTH` · 3 players · separator

- TTH | Cerriegold (`8361`)
- TTH | crazyetwas (`36255`)
- TTH | Vladimiro (`39293`)

### `VCP` · 3 players · separator

- VCP_FabioTon (`27732`)
- VCP_Mish (`24285`)
- VCP_Nickbeast95🦁 (`30873`)

### `WCC` · 3 players · separator

- WCC_DanieleMatrigale (`6793`)
- WCC_JustinM (`33516`)
- WCC_Logan (`28870`)

### `WYLD` · 3 players · space 2, separator 1

- WYLD Awesomenerddad (`46171`)
- WYLD Zurita (`23901`)
- WYLD_Strafees (`44181`)

### `👑` · 3 players · bracket

- [👑] Brendo Ikeda (`245551`)
- [👑] Jose Tavares (`285808`)
- [👑] Rubens Netto (`406861`)

## Pairs (2 players)

### `03C` · 2 players · bracket

- [03C] ageNDuck (`419349`)
- [03C] B.Yeo (`411543`)

### `60MB` · 2 players · separator

- 60MB_Ele (`29626`)
- 60MB_Ironbalden (`61516`)

### `99PL` · 2 players · bracket

- [99PL] Inkchantress (`7829`)
- [99PL]Yoshipked (`11615`)

### `AD-S` · 2 players · bracket

- [AD-S] Steevounet (`26867`)
- [AD-S]Romainpsj (`51539`)

### `ADAM` · 2 players · separator

- Adam - HHM 🐓 (`19669`)
- Adam_12thLore (`38006`)

### `AKOM` · 2 players · bracket

- [AKoM]Brikala (`74577`)
- [AKoM]Kittytheshinigamy42 (`30718`)

### `AOG` · 2 players · separator

- AOG_Enforcer201 (`65958`)
- AOG_Mochi (`40506`)

### `ART` · 2 players · bracket

- [ART] BlueEars626 (`16083`)
- [ART] Jayrems (`15791`)

### `ATLUS` · 2 players · space 1, trailing 1

- ATLUS Mesamob (`7512`)
- Markoth [ATLUS] (`10923`)

### `ATS` · 2 players · bracket

- [ATS] Bia branco (`52783`)
- [ATS] MrObscure (`15646`)

### `BA` · 2 players · separator

- BA_lorcana_opa (`12656`)
- BA_wolfgang (`13502`)

### `BIG` · 2 players · separator

- Big_King_Papa (`45018`)
- Big_Neck_ giraffe (`34727`)

### `CARDCROWS` · 2 players · separator

- CardCrows | Ronny (`17211`)
- CardCrows | Sascha (`30892`)

### `CHRISTIAN` · 2 players · separator

- Christian_J (`54436`)
- Christian_R (`9354`)

### `DANIEL` · 2 players · separator

- Daniel-Lewis (`44468`)
- Daniel_W (`19953`)

### `DANNY` · 2 players · separator

- Danny_MP (`17446`)
- Danny_oh (`8414`)

### `DCL` · 2 players · separator

- DCL-B&A (`17657`)
- DCL-B&A (`176181`)

### `DJ` · 2 players · space

- DJ Bex (`6861`)
- DJ Heim (`6723`)

### `DRL` · 2 players · separator

- DRL_clodda89 (`39372`)
- DRL_Marcoval90 (`17986`)

### `DSL` · 2 players · separator

- DSL_Denis (`14240`)
- DSL_Roxez (`25092`)

### `DT` · 2 players · separator

- DT_Noelia (`18492`)
- DT_Rodrigo (`13163`)

### `DYXONIAN` · 2 players · separator

- Dyxonian_INKINC (`6875`)
- Dyxonian_INKINC (`4179`)

### `ECC` · 2 players · separator

- ECC-Mark (`11342`)
- ECC_Frdrake (`10564`)

### `EI` · 2 players · separator

- EI | ElChato (`23629`)
- EI | Xyj (`15387`)

### `EL2` · 2 players · separator

- EL2_CarlesAFK (`13061`)
- EL2_Saraa (`45285`)

### `ELJ` · 2 players · separator

- ELJ_Alex (`32553`)
- ELJ_Ghartuck (`28037`)

### `EX` · 2 players · bracket

- [EX] Figure (`15837`)
- [EX] Wodnik (`7049`)

### `EXILED` · 2 players · bracket

- [Exiled] JLlera (`9479`)
- [Exiled] Marta G.H. (`9511`)

### `FAMILYQUESTS` · 2 players · separator

- FamilyQuests-Daniel (`7163`)
- FamilyQuests-Lily (`198759`)

### `FCM` · 2 players · separator

- FCM- HadesBrut-SilverRay (`16787`)
- FCM-HadesBrut-StepHahn (`18656`)

### `FDL` · 2 players · separator

- FDL - Kiwitch (`44733`)
- FDL-Yoks (`40382`)

### `FLO` · 2 players · separator

- Flo.CD (`191525`)
- flo_the_pingu (`30942`)

### `FRITE` · 2 players · separator

- FRITE-Algérienne (`201539`)
- FRITE-Ketchup (`47305`)

### `GI` · 2 players · separator

- GI-Keellath (`7933`)
- GI-Pepperjack McKringgleberry (`21922`)

### `GIL` · 2 players · separator

- Gil-Galad24 (`11210`)
- Gil_M (`43137`)

### `GMS` · 2 players · bracket 1, separator 1

- [GMS] Kelian (`46288`)
- GMS-Everest (`272751`)

### `IKG` · 2 players · bracket

- [IKG] VuDude (`37361`)
- [IKG] Young2064 (`29952`)

### `INKOGNITO` · 2 players · separator

- Inkognito_DGatsby (`37036`)
- Inkognito_najie (`30084`)

### `ISAAC` · 2 players · separator

- Isaac-Urza (`11833`)
- Isaac_OOO (`3036`)

### `ITI` · 2 players · separator

- ItI_Overlook (`10076`)
- ItI_Sawyer (`17680`)

### `JAVI` · 2 players · separator

- Javi-OTC (`24939`)
- Javi_ink (`65628`)

### `JAZZ` · 2 players · separator

- Jazz-Vador (`29322`)
- jazz.canop (`43395`)

### `JO` · 2 players · separator

- Jo-El (`80891`)
- Jo-One (`392444`)

### `JUST` · 2 players · separator

- just_alan91 (`13738`)
- just_op (`39686`)

### `KE` · 2 players · separator

- KE_Jan (`24822`)
- KE_Moritz (`31774`)

### `KLK` · 2 players · separator

- KLK_Kriou (`20241`)
- KLK_Silivyas (`33815`)

### `KOSTKA` · 2 players · bracket

- [KOSTKA] clapka_p (`26809`)
- [KOSTKA] Visargy (`15747`)

### `KP` · 2 players · space 1, separator 1

- KP YIP (`403363`)
- KP_quest (`7079`)

### `KUYA` · 2 players · space 1, separator 1

- KUYA AJ (`54570`)
- Kuya.Donny (`6998`)

### `LBK` · 2 players · space

- LBK JahirS🥶 (`14738`)
- LBK NicoBzn🫔 (`20360`)

### `LCC` · 2 players · space

- LCC Alex Heng (`35589`)
- LCC DK (`29427`)

### `LDL` · 2 players · separator

- LDL_DeboraAlbaina (`9799`)
- LDL_DiegoMartinez (`9794`)

### `LN` · 2 players · separator

- LN_Calmo (`13222`)
- LN_Pingu (`41906`)

### `LT41` · 2 players · bracket

- [LT41] Bazafrog (`31730`)
- [LT41] DarkGobl1n (`17759`)

### `MAADD` · 2 players · separator

- MAADD- L'ipnorospo🐸 (`22873`)
- MAADD_Dedawiz (`27210`)

### `MDG` · 2 players · separator

- MDG_Dante The Pizzafan (`7365`)
- MDG_Dreamer Lore (`13414`)

### `MDP` · 2 players · space 1, separator 1

- MDP Penan (`41531`)
- MDP_Mcividanes © (`15863`)

### `MHL🐦‍⬛` · 2 players · bracket

- [MHL🐦‍⬛]  Tene (`15546`)
- [MHL🐦‍⬛] Artichaud (`8158`)

### `MICHAEL` · 2 players · trailing 1, separator 1

- Boling4u (Michael) (`31081`)
- Michael-Andreas (`24438`)

### `MLK` · 2 players · bracket

- [MLK] Alejandruca 💖 (`11882`)
- [MLK] Vankyr (`12840`)

### `MOHS` · 2 players · bracket

- [MOHS] Fogz (`23736`)
- [MOHS] Neoraiden (`25176`)

### `MRS` · 2 players · separator

- Mrs. Villainous [ENV] (`8562`)
- Mrs.Dreamborn (`69517`)

### `MULL` · 2 players · separator

- MULL_Inkpeet (`23509`)
- MULL_Janosch39 (`31813`)

### `NJDS` · 2 players · bracket 1, separator 1

- [njds] teyi (`42051`)
- NJDS_Bersabal (`14429`)

### `NO` · 2 players · separator

- No.One_Boofasa (`18990`)
- no_its_becky_ (`15761`)

### `OOO` · 2 players · separator

- oOo - Maestro (`19169`)
- oOo - Never★Lucky (`15458`)

### `PCC` · 2 players · separator

- PCC_BlazingPiccia (`13096`)
- PCC_Tweeco (`30328`)

### `POP` · 2 players · bracket

- [PoP] Charl (`7618`)
- [PoP] Lyrakish (`6290`)

### `PPRO` · 2 players · separator

- PPRO_Noel (`14891`)
- PPRO_queesin (`39804`)

### `PROF` · 2 players · separator

- Prof. 101 (`7772`)
- Prof. MaxChamb (`21241`)

### `PSG` · 2 players · separator

- PSG - SirLore (`7613`)
- PSG-Lucas (`6923`)

### `QUESTLORE` · 2 players · separator

- QuestLore - Matt (`6751`)
- QuestLore - Thing 1 (`22872`)

### `RAFIKI` · 2 players · separator

- Rafiki_Kawaï (`61396`)
- Rafiki_Kawaï (`236744`)

### `RDS` · 2 players · bracket

- [RDS] Into The Light (`39441`)
- [RDS] Perceval (`14974`)

### `REF` · 2 players · bracket

- [REF] Baguich (`16059`)
- [REF] Lhurgo (`27922`)

### `RFL` · 2 players · bracket

- [RFL] - Krhalim (Fifi) (`19924`)
- [RFL] Oui_Ouaf (Loulou) (`19925`)

### `ROYAL` · 2 players · separator

- ROYAL - JessiG5 (`21703`)
- ROYAL-Ghost (`6600`)

### `RST` · 2 players · space 1, separator 1

- RST Maothi (`28088`)
- RST_Volonero (`280278`)

### `S11` · 2 players · separator

- S11_Nico (`10073`)
- S11_TruePika (`6435`)

### `SARAH` · 2 players · trailing 1, separator 1

- Ladyreadsalot (Sarah) (`12004`)
- sarah_pop (`17177`)

### `SBI` · 2 players · bracket 1, separator 1

- [SBi] TheBippi (`7769`)
- SBi_Cookie (`11197`)

### `SCAM` · 2 players · separator

- SCAM_Gatto (`28848`)
- SCAM_Mostarda (`19273`)

### `SHIFT` · 2 players · space

- SHIFT HAPPENS! (ILLUMITREES) (`7253`)
- SHIFT TheArchlord (`78754`)

### `SOU` · 2 players · bracket 1, separator 1

- [SOU] Emma_Mighty Mama (`19328`)
- SOU_MacLogan (`21446`)

### `SP` · 2 players · bracket 1, separator 1

- [SP] AG0NY (`32848`)
- SP_YouKnowJu (`22740`)

### `STEF` · 2 players · separator

- Stef.D (`19766`)
- Stef_jac (`21603`)

### `T61` · 2 players · bracket

- [T61] Majkel (`74149`)
- [T61] Panda (`60304`)

### `TCG` · 2 players · separator

- TCG_Kyle (`20934`)
- TCG_Thesaurus (`7684`)

### `TCR` · 2 players · separator

- TCR_Auslenderman (`42204`)
- TCR_endyucation (`13610`)

### `TDLC` · 2 players · separator

- TDLC_Clive (`176380`)
- TDLC_MicC25 (`29146`)

### `TIL` · 2 players · separator

- TIL-Lady Panno (`15232`)
- TIL-Panno (`39186`)

### `TM4` · 2 players · separator

- TM4_Melo (`18058`)
- TM4_Rob (`18056`)

### `TMB` · 2 players · separator

- TMB_Fatabik (`29321`)
- TMB_Ravioli89 (`53101`)

### `TRP` · 2 players · separator

- TRP • Corgi Malicieux (`41380`)
- TRP • TFKC (`29273`)

### `TSDXINK` · 2 players · separator

- TSDxINK_HurricaneDave (`11711`)
- TSDxINK_Keesee (`37431`)

### `TW` · 2 players · separator

- TW_Maddin (`20853`)
- TW_Maddin (`9055`)

### `UCP` · 2 players · separator

- UCP | Laura (`15555`)
- UCP | Wouter (`4529`)

### `VUF` · 2 players · space 1, separator 1

- VUF Adam H (`12440`)
- VUF_F5 (`19560`)

### `WPF` · 2 players · separator

- WPF_Cookie91 (`70434`)
- WPF_NinaZarg (`70433`)

### `❤️ KART` · 2 players · bracket

- [❤️ kart] Nieaneta (`12271`)
- [❤️ kart] 🐯 DonTigh 🐯 (`10813`)

### `💪🦈` · 2 players · emoji

- 💪🦈 Acevd93 (`24401`)
- 💪🦈Capibaradude (`56804`)
