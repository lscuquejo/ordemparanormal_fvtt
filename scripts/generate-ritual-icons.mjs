/**
 * Generates minimalist ritual SVG icons (512×512) themed by paranormal element.
 * Style matches class/origin icons: radial gradient background + bold silhouette.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RITUALS_JSON = path.resolve(
	ROOT,
	"../../ordem-paranormal-v1-vanilla-compendium/data/ordem-paranormal-rituais.json"
);
const OUT_DIR = path.join(ROOT, "media/icons/rituals");

const ELEMENT_THEME = {
	Morte: {
		center: "#2a2a2a",
		edge: "#000000",
		fg: "#ffffff",
		stroke: null,
		aura: true,
	},
	Sangue: {
		center: "#c8102e",
		edge: "#000000",
		fg: "#ff2244",
		stroke: "#000000",
		strokeWidth: 10,
	},
	Conhecimento: {
		center: "#d4af37",
		edge: "#000000",
		fg: "#ffd700",
		stroke: "#1a1a1a",
		strokeWidth: 8,
	},
	Medo: {
		center: "#8a8a9a",
		edge: "#1a1a22",
		fg: "#f0f0f5",
		stroke: null,
		smoke: true,
		fgOpacity: 0.82,
	},
	Energia: {
		center: "#00ff99",
		edge: "#000000",
		fg: "#00ffff",
		accent: "#ff00ff",
		stroke: null,
		neon: true,
	},
};

/** @type {Record<string, (s: number) => string>} */
const SYMBOLS = {
	"alterar-destino": () =>
		`<path d="M256 120 L320 200 L280 200 L340 320 L220 240 L260 240 L200 120 Z" fill="FG"/>
		 <circle cx="180" cy="360" r="28" fill="none" stroke="FG" stroke-width="14"/>
		 <circle cx="332" cy="360" r="28" fill="none" stroke="FG" stroke-width="14"/>`,
	"alterar-memoria": () =>
		`<ellipse cx="256" cy="240" rx="100" ry="80" fill="FG"/>
		 <path d="M180 240 Q256 180 332 240 Q256 300 180 240" fill="BG" opacity="0.5"/>
		 <rect x="200" y="340" width="112" height="24" rx="4" fill="FG" transform="rotate(-15 256 352)"/>`,
	"amaldicoar-arma": () =>
		`<path d="M256 100 L280 280 L256 260 L232 280 Z" fill="FG"/>
		 <rect x="244" y="280" width="24" height="120" fill="FG"/>
		 <path d="M200 400 Q256 360 312 400" fill="none" stroke="ACCENT" stroke-width="8"/>`,
	"amaldicoar-tecnologia": () =>
		`<rect x="160" y="180" width="192" height="140" rx="12" fill="none" stroke="FG" stroke-width="16"/>
		 <path d="M180 220 L332 280 M332 220 L180 280" stroke="FG" stroke-width="12"/>
		 <circle cx="256" cy="380" r="20" fill="FG"/>`,
	"ancora-temporal": () =>
		`<circle cx="256" cy="180" r="50" fill="none" stroke="FG" stroke-width="12"/>
		 <path d="M256 230 L256 380 M220 340 L256 380 L292 340 M200 380 L312 380" stroke="FG" stroke-width="14" fill="none"/>`,
	"aprimorar-fisico": () =>
		`<circle cx="256" cy="160" r="40" fill="FG"/>
		 <path d="M200 220 L180 380 M312 220 L332 380 M200 220 L312 220" stroke="FG" stroke-width="20" fill="none"/>
		 <ellipse cx="180" cy="380" rx="30" ry="20" fill="FG"/><ellipse cx="332" cy="380" rx="30" ry="20" fill="FG"/>`,
	"aprimorar-mente": () =>
		`<ellipse cx="256" cy="240" rx="90" ry="70" fill="FG"/>
		 <path d="M200 200 L180 160 M312 200 L332 160 M256 170 L256 130" stroke="ACCENT" stroke-width="10"/>
		 <circle cx="220" cy="230" r="12" fill="BG"/><circle cx="292" cy="230" r="12" fill="BG"/>`,
	"arma-atroz": () =>
		`<path d="M256 100 L300 200 L270 200 L320 350 L256 280 L192 350 L242 200 L212 200 Z" fill="FG"/>
		 <path d="M220 350 Q256 320 292 350" fill="none" stroke="STROKE" stroke-width="8"/>`,
	"armadura-de-sangue": () =>
		`<path d="M256 120 L340 180 L340 320 Q256 400 172 320 L172 180 Z" fill="FG"/>
		 <path d="M256 160 L256 360 M200 200 L312 200" stroke="STROKE" stroke-width="8" fill="none"/>`,
	"canalizar-o-medo": () =>
		`<path d="M160 380 Q256 200 352 380" fill="none" stroke="FG" stroke-width="20" opacity="0.6"/>
		 <ellipse cx="256" cy="280" rx="60" ry="80" fill="FG" opacity="0.5"/>
		 <path d="M256 180 L256 120 M230 140 L256 100 L282 140" stroke="FG" stroke-width="8"/>`,
	"capturar-o-coracao": () =>
		`<path d="M256 380 C180 300 140 220 180 180 C220 140 256 200 256 200 C256 200 292 140 332 180 C372 220 332 300 256 380 Z" fill="FG"/>
		 <rect x="200" y="260" width="112" height="16" rx="4" fill="STROKE"/><rect x="248" y="220" width="16" height="80" fill="STROKE"/>`,
	"chamas-do-caos": () =>
		`<path d="M256 400 Q200 320 220 240 Q180 280 200 180 Q256 120 312 180 Q332 280 292 240 Q312 320 256 400" fill="FG"/>
		 <path d="M256 400 Q240 300 256 220 Q272 300 256 400" fill="ACCENT" opacity="0.7"/>`,
	cicatrizacao: () =>
		`<path d="M180 280 Q256 220 332 280 Q256 340 180 280" fill="none" stroke="FG" stroke-width="16"/>
		 <path d="M220 260 L220 300 M256 250 L256 310 M292 260 L292 300" stroke="FG" stroke-width="6"/>`,
	cineraria: () =>
		`<path d="M200 320 L200 200 L256 160 L312 200 L312 320 Z" fill="FG" opacity="0.7"/>
		 <ellipse cx="256" cy="340" rx="80" ry="20" fill="FG" opacity="0.4"/>
		 <circle cx="230" cy="260" r="8" fill="FG" opacity="0.5"/><circle cx="280" cy="240" r="6" fill="FG" opacity="0.4"/>`,
	"coincidencia-forcada": () =>
		`<circle cx="220" cy="256" r="80" fill="none" stroke="FG" stroke-width="14"/>
		 <circle cx="292" cy="256" r="80" fill="none" stroke="ACCENT" stroke-width="14"/>`,
	"compreensao-paranormal": () =>
		`<rect x="180" y="200" width="152" height="120" rx="8" fill="FG"/>
		 <circle cx="256" cy="260" r="30" fill="BG"/><circle cx="256" cy="260" r="12" fill="FG"/>
		 <path d="M200 200 L256 160 L312 200" fill="FG"/>`,
	"conhecendo-o-medo": () =>
		`<ellipse cx="256" cy="256" rx="100" ry="60" fill="FG" opacity="0.8"/>
		 <circle cx="256" cy="256" r="35" fill="BG"/><circle cx="256" cy="256" r="14" fill="FG"/>
		 <path d="M160 320 Q256 380 352 320" fill="FG" opacity="0.3"/>`,
	"consumir-manancial": () =>
		`<path d="M256 140 Q340 200 340 280 Q340 360 256 400 Q172 360 172 280 Q172 200 256 140" fill="none" stroke="FG" stroke-width="16"/>
		 <path d="M256 200 L256 340 M220 260 L292 260" stroke="FG" stroke-width="10"/>`,
	"contato-paranormal": () =>
		`<path d="M200 380 Q180 280 220 220 Q256 180 292 220 Q332 280 312 380" fill="FG" opacity="0.5"/>
		 <path d="M256 220 L256 120 M230 160 L256 130 L282 160" stroke="FG" stroke-width="12"/>`,
	"contencao-fantasmagorica": () =>
		`<rect x="170" y="170" width="172" height="172" rx="8" fill="none" stroke="FG" stroke-width="14"/>
		 <ellipse cx="256" cy="256" rx="40" ry="60" fill="FG" opacity="0.6"/>
		 <path d="M240 220 L240 300 M272 220 L272 300" stroke="BG" stroke-width="6"/>`,
	"controle-mental": () =>
		`<circle cx="256" cy="200" r="50" fill="FG"/>
		 <path d="M220 260 L180 380 M292 260 L332 380 M240 280 L200 340 M272 280 L312 340" stroke="FG" stroke-width="8" fill="none"/>`,
	"convocacao-instantanea": () =>
		`<circle cx="256" cy="256" r="100" fill="none" stroke="FG" stroke-width="14"/>
		 <circle cx="256" cy="256" r="50" fill="FG" opacity="0.5"/>
		 <path d="M256 156 L256 120 M256 356 L256 392 M156 256 L120 256 M356 256 L392 256" stroke="ACCENT" stroke-width="8"/>`,
	"convocar-o-algoz": () =>
		`<path d="M256 120 L280 200 L256 180 L232 200 Z" fill="FG"/>
		 <rect x="248" y="200" width="16" height="140" fill="FG"/>
		 <path d="M200 340 L312 340" stroke="FG" stroke-width="16"/>`,
	"corpo-adaptado": () =>
		`<ellipse cx="256" cy="280" rx="80" ry="100" fill="FG"/>
		 <circle cx="256" cy="160" r="45" fill="FG"/>
		 <path d="M180 240 L140 200 M332 240 L372 200" stroke="FG" stroke-width="14"/>`,
	decadencia: () =>
		`<path d="M256 140 L280 380 L256 360 L232 380 Z" fill="FG" opacity="0.8"/>
		 <circle cx="220" cy="300" r="12" fill="FG" opacity="0.3"/><circle cx="290" cy="320" r="8" fill="FG" opacity="0.2"/>`,
	definhar: () =>
		`<path d="M256 380 Q200 300 220 220 Q256 160 292 220 Q312 300 256 380" fill="FG" opacity="0.6"/>
		 <path d="M230 280 Q256 260 282 280" fill="none" stroke="STROKE" stroke-width="6"/>`,
	"deflagracao-de-energia": () =>
		`<path d="M256 120 L290 220 L380 240 L300 280 L320 380 L256 320 L192 380 L212 280 L132 240 L222 220 Z" fill="FG"/>
		 <circle cx="256" cy="260" r="30" fill="ACCENT" opacity="0.8"/>`,
	"desacelerar-impacto": () =>
		`<path d="M180 256 H332" stroke="FG" stroke-width="16"/>
		 <path d="M200 220 L180 256 L200 292 M240 230 L220 256 L240 282 M280 240 L260 256 L280 272" stroke="FG" stroke-width="10" fill="none"/>`,
	descarnar: () =>
		`<ellipse cx="256" cy="260" rx="70" ry="90" fill="FG"/>
		 <path d="M200 200 Q256 160 312 200 Q340 260 312 320 Q256 360 200 320 Q170 260 200 200" fill="none" stroke="STROKE" stroke-width="8"/>`,
	"deteccao-de-ameacas": () =>
		`<circle cx="256" cy="256" r="80" fill="none" stroke="FG" stroke-width="10"/>
		 <circle cx="256" cy="256" r="40" fill="FG"/>
		 <path d="M256 176 L256 120 M256 336 L256 392 M176 256 L120 256 M336 256 L392 256" stroke="FG" stroke-width="6" opacity="0.6"/>`,
	"dissipar-ritual": () =>
		`<path d="M256 140 L320 280 L280 280 L340 380 L220 300 L260 300 L180 140 Z" fill="FG" opacity="0.5"/>
		 <path d="M200 200 L312 312 M312 200 L200 312" stroke="FG" stroke-width="12"/>`,
	"dissonancia-acustica": () =>
		`<path d="M180 256 Q220 180 260 256 T340 256" fill="none" stroke="FG" stroke-width="12"/>
		 <path d="M172 280 Q212 360 252 280 T332 280" fill="none" stroke="ACCENT" stroke-width="12"/>`,
	"distorcao-temporal": () =>
		`<circle cx="256" cy="256" r="90" fill="none" stroke="FG" stroke-width="12"/>
		 <path d="M256 166 L280 256 L256 346 L232 256 Z" fill="FG" opacity="0.7"/>
		 <path d="M190 190 Q256 220 322 190" fill="none" stroke="ACCENT" stroke-width="6"/>`,
	"distorcer-aparencia": () =>
		`<ellipse cx="256" cy="240" rx="80" ry="100" fill="FG"/>
		 <circle cx="230" cy="220" r="15" fill="BG"/><circle cx="282" cy="220" r="15" fill="BG"/>
		 <path d="M220 280 Q256 320 292 280" fill="none" stroke="STROKE" stroke-width="6"/>`,
	"eco-espiral": () =>
		`<path d="M256 256 m-80 0 a80 80 0 1 1 60 -60 a60 60 0 1 0 40 -40 a40 40 0 1 1 20 -20" fill="none" stroke="FG" stroke-width="12"/>`,
	eletrocussao: () =>
		`<path d="M280 120 L220 260 L260 260 L200 400 L320 220 L270 220 Z" fill="FG"/>
		 <path d="M280 120 L220 260 L260 260 L200 400 L320 220 L270 220 Z" fill="none" stroke="ACCENT" stroke-width="4" opacity="0.6"/>`,
	embaralhar: () =>
		`<rect x="180" y="200" width="80" height="120" rx="6" fill="FG" transform="rotate(-15 220 260)"/>
		 <rect x="220" y="190" width="80" height="120" rx="6" fill="FG" opacity="0.8"/>
		 <rect x="260" y="200" width="80" height="120" rx="6" fill="FG" transform="rotate(15 300 260)"/>`,
	enfeiticar: () =>
		`<path d="M256 140 L270 220 L350 220 L285 270 L310 350 L256 300 L202 350 L227 270 L162 220 L242 220 Z" fill="FG"/>
		 <circle cx="256" cy="240" r="20" fill="ACCENT" opacity="0.6"/>`,
	"esconder-dos-olhos": () =>
		`<ellipse cx="256" cy="256" rx="100" ry="50" fill="FG"/>
		 <path d="M180 256 Q256 200 332 256" fill="none" stroke="BG" stroke-width="12"/>
		 <path d="M160 320 L352 320" stroke="FG" stroke-width="8" opacity="0.5"/>`,
	"espirais-da-perdicao": () =>
		`<path d="M256 400 Q180 340 180 256 Q180 172 256 112 Q332 172 332 256 Q332 340 256 400" fill="none" stroke="FG" stroke-width="14"/>
		 <circle cx="256" cy="256" r="30" fill="FG"/>`,
	"ferver-sangue": () =>
		`<path d="M256 380 C200 300 180 240 220 200 C260 160 256 140 256 140 C256 140 252 160 292 200 C332 240 312 300 256 380 Z" fill="FG"/>
		 <path d="M230 280 Q256 260 282 280 Q256 300 230 280" fill="ACCENT" opacity="0.5"/>`,
	"fim-inevitavel": () =>
		`<path d="M220 160 L220 320 L292 320 L292 160 Z" fill="none" stroke="FG" stroke-width="12"/>
		 <path d="M220 220 L292 220 M220 260 L292 260" stroke="FG" stroke-width="8"/>
		 <circle cx="256" cy="360" r="30" fill="FG" opacity="0.5"/>`,
	"flagelo-de-sangue": () =>
		`<path d="M256 120 Q280 200 260 280 Q300 320 256 400 Q212 320 252 280 Q232 200 256 120" fill="none" stroke="FG" stroke-width="14"/>
		 <circle cx="256" cy="120" r="16" fill="FG"/>`,
	"forma-monstruosa": () =>
		`<path d="M200 320 L180 200 L230 240 L256 180 L282 240 L332 200 L312 320 Z" fill="FG"/>
		 <circle cx="230" cy="260" r="12" fill="BG"/><circle cx="282" cy="260" r="12" fill="BG"/>`,
	"fortalecimento-sensorial": () =>
		`<ellipse cx="200" cy="260" rx="40" ry="60" fill="FG"/>
		 <ellipse cx="312" cy="260" rx="40" ry="60" fill="FG"/>
		 <path d="M256 180 L256 140 M256 380 L256 340" stroke="ACCENT" stroke-width="8"/>`,
	hemofagia: () =>
		`<path d="M230 180 L230 320 L240 340 L256 360 L272 340 L282 320 L282 180 Z" fill="FG"/>
		 <path d="M220 180 L230 160 L240 180 M272 180 L282 160 L292 180" stroke="STROKE" stroke-width="6" fill="FG"/>`,
	inexistir: () =>
		`<ellipse cx="256" cy="280" rx="60" ry="90" fill="FG" opacity="0.4"/>
		 <circle cx="256" cy="180" r="40" fill="FG" opacity="0.3"/>
		 <path d="M180 200 L332 360 M332 200 L180 360" stroke="FG" stroke-width="6" opacity="0.5"/>`,
	"invadir-mente": () =>
		`<ellipse cx="256" cy="240" rx="90" ry="70" fill="FG" opacity="0.6"/>
		 <path d="M180 240 L120 240 M332 240 L392 240" stroke="FG" stroke-width="12"/>
		 <path d="M120 240 L100 220 L100 260 Z M392 240 L412 220 L412 260 Z" fill="FG"/>`,
	"involucro-de-carne": () =>
		`<ellipse cx="256" cy="280" rx="90" ry="110" fill="FG"/>
		 <path d="M190 220 Q256 180 322 220 Q350 280 322 340 Q256 380 190 340 Q160 280 190 220" fill="none" stroke="STROKE" stroke-width="8"/>`,
	"lamina-do-medo": () =>
		`<path d="M256 100 L270 280 L256 260 L242 280 Z" fill="FG" opacity="0.8"/>
		 <path d="M200 280 Q256 240 312 280" fill="none" stroke="FG" stroke-width="4" opacity="0.5"/>
		 <rect x="248" y="280" width="16" height="100" fill="FG" opacity="0.6"/>`,
	localizacao: () =>
		`<path d="M256 140 C200 140 160 200 160 260 C160 340 256 400 256 400 C256 400 352 340 352 260 C352 200 312 140 256 140 Z" fill="FG"/>
		 <circle cx="256" cy="260" r="40" fill="BG"/>`,
	luz: () =>
		`<circle cx="256" cy="220" r="60" fill="FG"/>
		 <path d="M256 120 L256 80 M256 360 L256 400 M176 220 L136 220 M336 220 L376 220 M200 140 L170 110 M312 140 L342 110" stroke="ACCENT" stroke-width="10"/>`,
	"medo-tangivel": () =>
		`<path d="M220 380 Q200 280 230 200 Q256 160 282 200 Q312 280 292 380 Z" fill="FG" opacity="0.5"/>
		 <circle cx="240" cy="240" r="10" fill="FG" opacity="0.7"/><circle cx="272" cy="240" r="10" fill="FG" opacity="0.7"/>`,
	"mergulho-mental": () =>
		`<ellipse cx="256" cy="220" rx="80" ry="60" fill="FG"/>
		 <path d="M256 280 L256 380 M230 340 L256 380 L282 340" stroke="FG" stroke-width="12" fill="none"/>`,
	"miasma-entropico": () =>
		`<ellipse cx="220" cy="280" rx="60" ry="40" fill="FG" opacity="0.5"/>
		 <ellipse cx="290" cy="260" rx="50" ry="35" fill="FG" opacity="0.4"/>
		 <ellipse cx="256" cy="320" rx="70" ry="30" fill="FG" opacity="0.6"/>`,
	"nuvem-de-cinzas": () =>
		`<ellipse cx="200" cy="260" rx="50" ry="30" fill="FG" opacity="0.5"/>
		 <ellipse cx="280" cy="250" rx="60" ry="35" fill="FG" opacity="0.6"/>
		 <ellipse cx="256" cy="300" rx="80" ry="40" fill="FG" opacity="0.4"/>`,
	"odio-incontrolavel": () =>
		`<path d="M200 380 L200 260 Q200 200 256 200 Q312 200 312 260 L312 380" fill="FG"/>
		 <path d="M230 240 L240 260 L250 240 M262 240 L272 260 L282 240" stroke="STROKE" stroke-width="6"/>
		 <path d="M240 320 Q256 340 272 320" fill="none" stroke="STROKE" stroke-width="8"/>`,
	"ouvir-os-sussurros": () =>
		`<ellipse cx="200" cy="260" rx="35" ry="55" fill="FG"/>
		 <path d="M260 240 Q320 220 340 260 Q320 300 260 280" fill="none" stroke="FG" stroke-width="8"/>
		 <path d="M340 250 L360 240 L360 280 Z" fill="FG" opacity="0.6"/>`,
	paradoxo: () =>
		`<path d="M200 280 C200 200 312 200 312 280 C312 360 200 360 200 280" fill="none" stroke="FG" stroke-width="14"/>
		 <path d="M312 280 C312 200 200 200 200 280 C200 360 312 360 312 280" fill="none" stroke="FG" stroke-width="14" opacity="0.5"/>`,
	perturbacao: () =>
		`<rect x="170" y="200" width="172" height="112" rx="8" fill="FG" opacity="0.3"/>
		 <path d="M180 220 H332 M180 256 H332 M180 292 H332" stroke="FG" stroke-width="6"/>
		 <path d="M200 230 L220 250 M240 230 L260 250" stroke="ACCENT" stroke-width="4"/>`,
	"poeira-da-podridao": () =>
		`<circle cx="230" cy="240" r="8" fill="FG" opacity="0.6"/><circle cx="270" cy="220" r="6" fill="FG" opacity="0.5"/>
		 <circle cx="256" cy="280" r="10" fill="FG" opacity="0.7"/><circle cx="290" cy="300" r="7" fill="FG" opacity="0.4"/>
		 <circle cx="220" cy="310" r="9" fill="FG" opacity="0.5"/><circle cx="256" cy="256" r="50" fill="none" stroke="FG" stroke-width="8" opacity="0.4"/>`,
	"polarizacao-caotica": () =>
		`<rect x="200" y="180" width="40" height="140" rx="4" fill="FG"/>
		 <rect x="272" y="180" width="40" height="140" rx="4" fill="ACCENT"/>
		 <path d="M240 250 L272 250 M240 290 L272 290" stroke="FG" stroke-width="6"/>
		 <path d="M180 256 H200 M312 256 H332" stroke="ACCENT" stroke-width="8"/>`,
	possessao: () =>
		`<ellipse cx="256" cy="300" rx="60" ry="80" fill="FG" opacity="0.5"/>
		 <ellipse cx="256" cy="180" rx="50" ry="50" fill="FG" opacity="0.7"/>
		 <path d="M256 230 L256 180" stroke="ACCENT" stroke-width="6" stroke-dasharray="8 8"/>`,
	"presenca-do-medo": () =>
		`<circle cx="256" cy="256" r="100" fill="none" stroke="FG" stroke-width="8" opacity="0.3"/>
		 <circle cx="256" cy="256" r="70" fill="none" stroke="FG" stroke-width="6" opacity="0.5"/>
		 <circle cx="256" cy="256" r="40" fill="FG" opacity="0.6"/>`,
	"protecao-contra-rituais": () =>
		`<path d="M256 140 L340 180 L340 300 Q256 380 172 300 L172 180 Z" fill="FG" opacity="0.5"/>
		 <path d="M220 220 L292 292 M292 220 L220 292" stroke="FG" stroke-width="10"/>`,
	purgatorio: () =>
		`<path d="M256 380 Q200 320 200 260 Q200 180 256 140 Q312 180 312 260 Q312 320 256 380" fill="FG" opacity="0.6"/>
		 <path d="M256 200 L256 320 M230 260 L282 260" stroke="ACCENT" stroke-width="8"/>`,
	"rejeitar-nevoa": () =>
		`<ellipse cx="220" cy="280" rx="70" ry="40" fill="FG" opacity="0.3"/>
		 <path d="M280 200 L280 360 M310 230 L350 256 L310 282" fill="FG"/>`,
	"salto-fantasma": () =>
		`<ellipse cx="256" cy="280" rx="50" ry="70" fill="FG" opacity="0.4"/>
		 <path d="M180 320 Q220 240 256 200 Q292 240 332 320" fill="none" stroke="FG" stroke-width="10"/>
		 <circle cx="256" cy="180" r="25" fill="FG" opacity="0.6"/>`,
	"sopro-do-caos": () =>
		`<path d="M180 320 Q220 280 200 240 Q240 260 256 200 Q272 260 312 240 Q292 280 332 320" fill="FG" opacity="0.7"/>
		 <circle cx="230" cy="260" r="8" fill="ACCENT"/><circle cx="282" cy="250" r="6" fill="ACCENT"/>`,
	"tecer-ilusao": () =>
		`<path d="M180 240 Q256 180 332 240 Q256 300 180 240" fill="none" stroke="FG" stroke-width="10"/>
		 <path d="M200 280 Q256 320 312 280 Q256 360 200 280" fill="none" stroke="FG" stroke-width="8" opacity="0.6"/>`,
	"tela-de-ruido": () =>
		`<rect x="170" y="180" width="172" height="152" rx="8" fill="FG" opacity="0.2"/>
		 <path d="M180 200 L200 220 L180 240 L200 260 L180 280 L200 300" stroke="FG" stroke-width="4"/>
		 <path d="M220 200 L240 230 L220 260 L240 290 L220 320" stroke="ACCENT" stroke-width="4"/>`,
	teletransporte: () =>
		`<circle cx="256" cy="256" r="80" fill="none" stroke="FG" stroke-width="12" stroke-dasharray="20 12"/>
		 <path d="M256 176 L256 120 M256 336 L256 392" stroke="ACCENT" stroke-width="8"/>
		 <circle cx="256" cy="256" r="20" fill="FG"/>`,
	"tentaculos-de-lodo": () =>
		`<path d="M256 180 Q200 240 180 320 M256 180 Q312 240 332 320 M256 180 Q256 280 256 380" stroke="FG" stroke-width="14" fill="none"/>
		 <circle cx="256" cy="180" r="25" fill="FG"/>`,
	"terceiro-olho": () =>
		`<ellipse cx="256" cy="260" rx="90" ry="50" fill="FG"/>
		 <circle cx="256" cy="260" r="25" fill="BG"/>
		 <circle cx="256" cy="200" r="20" fill="FG"/>
		 <path d="M246 190 L256 170 L266 190" fill="FG"/>`,
	"transfigurar-agua": () =>
		`<path d="M256 140 Q200 200 200 260 Q200 340 256 380 Q312 340 312 260 Q312 200 256 140" fill="FG" opacity="0.6"/>
		 <path d="M230 260 Q256 240 282 260 Q256 280 230 260" fill="ACCENT" opacity="0.5"/>`,
	"transfigurar-terra": () =>
		`<path d="M180 320 L256 160 L332 320 Z" fill="FG"/>
		 <path d="M210 290 L256 220 L302 290" fill="STROKE" opacity="0.4"/>`,
	"transfusao-vital": () =>
		`<path d="M220 380 C180 300 180 240 220 200 C240 180 256 200 256 200 C256 200 272 180 292 200 C332 240 332 300 292 380" fill="FG" opacity="0.5"/>
		 <path d="M180 256 H332" stroke="FG" stroke-width="10"/>
		 <path d="M312 256 L292 240 L292 272 Z" fill="FG"/>`,
	"velocidade-mortal": () =>
		`<ellipse cx="256" cy="280" rx="50" ry="80" fill="FG" opacity="0.7"/>
		 <path d="M140 280 H200 M312 280 H372" stroke="FG" stroke-width="8" opacity="0.5"/>
		 <circle cx="256" cy="180" r="35" fill="FG" opacity="0.7"/>`,
	videncia: () =>
		`<circle cx="256" cy="260" r="70" fill="FG" opacity="0.4"/>
		 <circle cx="256" cy="260" r="50" fill="none" stroke="FG" stroke-width="8"/>
		 <ellipse cx="256" cy="240" rx="30" ry="20" fill="ACCENT" opacity="0.6"/>`,
	"vinculo-de-sangue": () =>
		`<path d="M220 380 C180 300 180 240 220 200 C256 160 256 200 256 200 C256 200 256 160 292 200 C332 240 332 300 292 380" fill="FG" opacity="0.5"/>
		 <path d="M200 280 Q256 320 312 280" fill="none" stroke="STROKE" stroke-width="8"/>`,
	"vomitar-pestes": () =>
		`<ellipse cx="256" cy="220" rx="50" ry="40" fill="FG"/>
		 <path d="M230 260 Q256 340 282 260" fill="FG" opacity="0.6"/>
		 <circle cx="240" cy="300" r="6" fill="ACCENT"/><circle cx="260" cy="320" r="5" fill="ACCENT"/>`,
	"zerar-entropia": () =>
		`<rect x="200" y="200" width="112" height="112" rx="8" fill="none" stroke="FG" stroke-width="12"/>
		 <path d="M230 256 H282 M256 230 V282" stroke="FG" stroke-width="10"/>`,
};

function pickTheme(elements) {
	const primary = elements?.[0] ?? "Energia";
	if (elements?.length > 1) {
		return {
			center: "#9013fe",
			edge: "#000000",
			fg: "#ffffff",
			accent: "#ff00ff",
			stroke: "#000000",
			strokeWidth: 8,
			neon: true,
			multi: true,
		};
	}
	return ELEMENT_THEME[primary] ?? ELEMENT_THEME.Energia;
}

function hashSeed(id) {
	return parseInt(createHash("md5").update(id).digest("hex").slice(0, 8), 16);
}

function neonExtras(id, theme) {
	if (!theme.neon) return "";
	const seed = hashSeed(id);
	const colors = [theme.fg, theme.accent, "#ffff00", "#00ff00"];
	let out = "";
	for (let i = 0; i < 4; i++) {
		const angle = ((seed + i * 97) % 360) * (Math.PI / 180);
		const r = 120 + ((seed >> i) % 40);
		const cx = 256 + Math.cos(angle) * r * 0.5;
		const cy = 256 + Math.sin(angle) * r * 0.5;
		const sz = 8 + ((seed >> (i * 3)) % 12);
		out += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${sz}" fill="${
			colors[i % colors.length]
		}" opacity="0.55"/>`;
	}
	return out;
}

function buildSvg(id, elements) {
	const theme = pickTheme(elements);
	const gradId = `ritual-grad-${id}`;
	const symbolFn = SYMBOLS[id];
	if (!symbolFn) {
		console.warn(`Missing symbol for ${id}, using default star`);
	}
	const symbolRaw = (
		symbolFn ??
		(() =>
			`<path d="M256 140 L280 220 L360 240 L290 280 L310 360 L256 320 L202 360 L222 280 L152 240 L232 220 Z" fill="FG"/>`)
	)();

	const replacements = {
		FG: theme.fg,
		BG: theme.edge,
		STROKE: theme.stroke ?? theme.edge,
		ACCENT: theme.accent ?? theme.fg,
	};
	let symbol = symbolRaw;
	for (const [key, val] of Object.entries(replacements)) {
		symbol = symbol.replaceAll(key, val);
	}

	if (theme.stroke) {
		const sw = Math.round((theme.strokeWidth ?? 8) / 2);
		symbol = symbol.replace(/fill="([^"]+)"/g, (match, color) => {
			if (color === "none") return match;
			return match.replace(
				/"$/,
				`" stroke="${theme.stroke}" stroke-width="${sw}" stroke-linejoin="round" paint-order="stroke fill"`
			);
		});
	}
	const fgOpacity = theme.fgOpacity ?? 1;

	let extras = "";
	if (theme.aura) {
		extras += `<circle cx="256" cy="256" r="190" fill="none" stroke="${theme.fg}" stroke-width="3" opacity="0.2"/>
			<circle cx="256" cy="256" r="150" fill="none" stroke="${theme.fg}" stroke-width="2" opacity="0.35"/>
			<circle cx="256" cy="256" r="110" fill="none" stroke="${theme.fg}" stroke-width="2" opacity="0.5"/>`;
	}
	if (theme.smoke) {
		extras += `<ellipse cx="200" cy="340" rx="90" ry="30" fill="${theme.fg}" opacity="0.15"/>
			<ellipse cx="310" cy="360" rx="70" ry="25" fill="${theme.fg}" opacity="0.12"/>`;
	}
	if (theme.neon) {
		extras += neonExtras(id, theme);
	}

	const filterDef = theme.neon
		? `<filter id="glow-${id}"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
		: theme.smoke
		? `<filter id="smoke-${id}"><feGaussianBlur stdDeviation="2"/></filter>`
		: "";

	const filterUse = theme.neon ? ` filter="url(#glow-${id})"` : theme.smoke ? ` filter="url(#smoke-${id})"` : "";

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs>
<radialGradient id="${gradId}">
<stop offset="0%" stop-color="${theme.center}" stop-opacity="1"/>
<stop offset="100%" stop-color="${theme.edge}" stop-opacity="1"/>
</radialGradient>
${filterDef}
</defs>
<rect width="512" height="512" fill="url(#${gradId})"/>
${extras}
<g transform="translate(0,0)" opacity="${fgOpacity}"${filterUse}>
${symbol}
</g>
</svg>`;
}

function main() {
	const data = JSON.parse(fs.readFileSync(RITUALS_JSON, "utf8"));
	const rituals = data.rituals ?? data;
	fs.mkdirSync(OUT_DIR, { recursive: true });

	let count = 0;
	for (const ritual of rituals) {
		const svg = buildSvg(ritual.id, ritual.elements);
		const outPath = path.join(OUT_DIR, `${ritual.id}.svg`);
		fs.writeFileSync(outPath, svg, "utf8");
		count++;
	}

	console.log(`Generated ${count} ritual icons in ${OUT_DIR}`);
}

main();
