		// bait bag hanging in the kitchen
		const bag = sphere( 0.06, 8, 6 );
		bag.scale( 1, 1.3, 1 );
		bag.translate( 0, H - 0.1, - 0.2 );
		bag.applyMatrix4( m );
		kit.add( 'fittings', bag, { color: 0xb3261e, rough: 0.8 } );

	}

}

// ------------------------------------------------------------------ hauler and davit (starboard)

const HAULER = { x: - 1.0, z: - 0.62, y: 1.34 };

function buildHauler( kit, L ) {

	const t = L.tAtSheerZ( - 0.78 );
	const xg = - ( L.sheerX( t ) - 0.035 ), yg = L.sheerY( t ) + 0.045;

	// davit arm from the rail up and outboard, with a snatch block
	const pts = [ V( xg, yg, - 0.8 ), V( xg - 0.02, yg + 0.45, - 0.78 ), V( xg - 0.05, 1.86, - 0.76 ), V( xg - 0.13, 2.06, - 0.74 ), V( xg - 0.3, 2.11, - 0.73 ), V( xg - 0.43, 2.07, - 0.72 ) ];
	kit.add( 'fittings', tube( pts, 0.03, 32, 8 ), STAINLESS );
	const foot = roundedBox( 0.12, 0.02, 0.16, 0.008, 1 );
	foot.translate( xg, yg + 0.01, - 0.8 );
	kit.add( 'fittings', foot, STAINLESS );
	const tip = pts[ pts.length - 1 ];
	const tipCap = sphere( 0.03, 10, 6 );
	tipCap.translate( tip.x, tip.y, tip.z );
	kit.add( 'fittings', tipCap, STAINLESS );
	kit.add( 'fittings', rod( tip, tip.clone().add( V( 0, - 0.12, 0 ) ), 0.01, 6 ), STAINLESS );
	const bc = tip.clone().add( V( 0, - 0.22, 0 ) );
	for ( const dz of [ - 0.022, 0.022 ] ) {

		const cheek = cylinder( 0.085, 0.085, 0.01, 16 );
		cheek.applyMatrix4( mat4( bc.x, bc.y, bc.z + dz, Math.PI / 2, 0, 0 ) );
		kit.add( 'fittings', cheek, GALV );

	}

	const sheave = cylinder( 0.07, 0.07, 0.034, 16 );
	sheave.applyMatrix4( mat4( bc.x, bc.y, bc.z, Math.PI / 2, 0, 0 ) );
	kit.add( 'fittings', sheave, { color: 0x2b2d30, rough: 0.6 } );

	// hauler: post, hydraulic motor and V-groove sheave facing aft
	const { x, y, z } = HAULER;
	kit.add( 'fittings', rod( V( x, L.deckY, z + 0.1 ), V( x, y - 0.1, z + 0.1 ), 0.038, 12 ), GALV );
	const plate = box( 0.2, 0.012, 0.2 );
	plate.translate( x, L.deckY + 0.006, z + 0.1 );
	kit.add( 'fittings', plate, GALV );
	const motor = cylinder( 0.075, 0.075, 0.17, 18 );
	motor.applyMatrix4( mat4( x, y, z + 0.13, Math.PI / 2, 0, 0 ) );
	kit.add( 'fittings', motor, { color: 0x3a4048, rough: 0.45, metal: 0.3 } );
	const head = lathe( [ [ 0, - 0.05 ], [ 0.2, - 0.05 ], [ 0.205, - 0.04 ], [ 0.1, - 0.006 ], [ 0.1, 0.006 ], [ 0.205, 0.04 ], [ 0.2, 0.05 ], [ 0, 0.05 ] ], 28 );
	head.applyMatrix4( mat4( x, y, z, Math.PI / 2, 0, 0 ) );
	kit.add( 'fittings', head, GALV );
	const hubCap = cylinder( 0.04, 0.05, 0.03, 12 );
	hubCap.applyMatrix4( mat4( x, y, z - 0.06, Math.PI / 2, 0, 0 ) );
	kit.add( 'fittings', hubCap, GALV );
	// hydraulic hoses down to the deck
	kit.add( 'fittings', tube( [ V( x + 0.05, y, z + 0.2 ), V( x + 0.12, y - 0.2, z + 0.3 ), V( x + 0.1, 0.6, z + 0.28 ), V( x + 0.06, L.deckY + 0.02, z + 0.25 ) ], 0.012, 20, 5 ), BLACK );
	kit.add( 'fittings', tube( [ V( x - 0.05, y, z + 0.2 ), V( x - 0.02, y - 0.25, z + 0.32 ), V( x + 0.02, 0.62, z + 0.3 ), V( x + 0.02, L.deckY + 0.02, z + 0.28 ) ], 0.012, 20, 5 ), BLACK );

	// pot warp reeved from the block into the hauler and down to a loose pile
	const rope = [ bc.clone().add( V( 0.07, 0, 0 ) ), V( x - 0.3, y + 0.35, z + 0.02 ), V( x - 0.12, y + 0.2, z ), V( x + 0.2, y - 0.02, z - 0.01 ), V( x + 0.16, y - 0.25, z - 0.01 ), V( x + 0.05, 0.72, z - 0.1 ), V( x + 0.2, L.deckY + 0.02, z - 0.35 ) ];
	kit.add( 'fittings', tube( rope, 0.009, 48, 4 ), { color: 0xe4c235, rough: 0.8, pattern: 1 } );

}

// ------------------------------------------------------------------ coiled pot warp

function coil( cx, cy, cz, turns, radius, ropeR, seed ) {

	const pts = [];
	const perTurn = 12;
	const n = turns * perTurn;
	for ( let k = 0; k <= n; k ++ ) {

		const f = k / n;
		const a = k / perTurn * Math.PI * 2 + seed;
		const r = radius * ( 1 - 0.12 * f ) + 0.012 * Math.sin( k * 0.9 + seed * 3 );
		const y = cy + ropeR + f * turns * ropeR * 1.35 + 0.004 * Math.sin( k * 1.7 + seed );
		pts.push( V( cx + Math.cos( a ) * r, y, cz + Math.sin( a ) * r ) );

	}

	// tail leading off the top of the coil
	const last = pts[ pts.length - 1 ];
	pts.push( V( last.x * 0.7 + cx * 0.3 + 0.12, last.y - 0.01, last.z + 0.2 ), V( last.x + 0.35, cy + ropeR, last.z + 0.4 ) );
	return tube( pts, ropeR, turns * 21 + 10, 4 );

}

function buildCoils( kit, L ) {

	kit.add( 'fittings', coil( - 0.5, L.deckY, - 2.15, 5, 0.22, 0.011, 0.3 ), { color: 0xe4c235, rough: 0.8, pattern: 1 } );
	const topTrap = L.deckY + 0.03 + TRAP.H + 0.012;
	kit.add( 'fittings', coil( - 0.68, topTrap, - 3.2, 4, 0.19, 0.01, 1.7 ), { color: 0x2f6f4f, rough: 0.8, pattern: 1 } );

}

// ------------------------------------------------------------------ buoys lying on deck

function buildBuoys( kit, L ) {

	const place = [
		[ - 0.2, L.deckY + 0.075, - 2.75, Math.PI / 2, 0.4 ],
		[ 0.12, L.deckY + 0.075, - 3.0, Math.PI / 2, - 0.9 ],
	];
	for ( const [ x, y, z, rx, ry ] of place ) {

		const m = mat4( x, y, z, rx, ry, 0, 1, 1, 1, 'YXZ' );
		for ( const [ g, opts ] of buoyGeometry( undefined, 0.3 ) ) {

			g.translate( 0, - 0.23, 0 );
			g.applyMatrix4( m );
			kit.add( 'fittings', g, opts );

		}

	}

}

// ------------------------------------------------------------------ fenders

const FENDERS = [ [ - 1, - 2.4 ], [ - 1, - 1.05 ], [ - 1, 0.65 ], [ 1, - 1.7 ] ];

function buildFenders( kit, L ) {

	const prof = [ [ 0, 0 ], [ 0.03, 0.004 ], [ 0.055, 0.016 ], [ 0.07, 0.04 ], [ 0.075, 0.07 ], [ 0.075, 0.43 ], [ 0.07, 0.46 ], [ 0.055, 0.484 ], [ 0.03, 0.496 ], [ 0, 0.5 ] ];
	for ( const [ s, z ] of FENDERS ) {

		const yTop = 0.86;
		const hullX = L.hullXAt( z, yTop - 0.05 );
		const fx = s * ( hullX + 0.08 );
		const f = lathe( prof, 12 );
		f.translate( fx, yTop - 0.5, z );
		kit.add( 'fittings', f, { color: 0x1d3a66, rough: 0.45 } );
		const eye = torus( 0.018, 0.006, 5, 10 );
		eye.translate( fx, yTop + 0.018, z );
		kit.add( 'fittings', eye, { color: 0x1d3a66, rough: 0.45 } );
		// fender line up and over the gunwale to a cleat inside
		const t = L.tAtSheerZ( z );
		const ys = L.sheerY( t ) + 0.05;
		const xo = s * ( L.sheerX( t ) + 0.01 ), xi = s * ( L.sheerX( t ) - L.shell - 0.05 );
		const line = [ V( fx, yTop + 0.03, z ), V( fx - s * 0.01, ( yTop + ys ) / 2, z ), V( xo, ys, z ), V( ( xo + xi ) / 2, ys + 0.012, z ), V( xi, ys - 0.03, z ) ];
		kit.add( 'fittings', tube( line, 0.006, 16, 4 ), { color: 0xf0efe8, rough: 0.8, pattern: 1 } );

	}

}

// ------------------------------------------------------------------ cleats

function cleat( pos, yaw, len = 0.2 ) {

	const parts = [];
	const horn = cylinder( 0.011, 0.011, len * 0.7, 8 );
	horn.applyMatrix4( mat4( 0, 0.045, 0, Math.PI / 2, 0, 0 ) );
	parts.push( horn );
	for ( const s of [ 1, - 1 ] ) {

		const tipC = cylinder( 0.006, 0.011, len * 0.15, 8 );
		tipC.applyMatrix4( mat4( 0, 0.045, s * len * 0.425, s * Math.PI / 2, 0, 0 ) );
		parts.push( tipC );
		const foot = cylinder( 0.013, 0.018, 0.045, 8 );
		foot.translate( 0, 0.0225, s * len * 0.22 );
		parts.push( foot );

	}

	const m = mat4( pos.x, pos.y, pos.z, 0, yaw, 0 );
	return parts.map( ( p ) => p.applyMatrix4( m ) );

}

function buildCleats( kit, L ) {

	const list = [];
	for ( const s of [ 1, - 1 ] ) {

		for ( const z of [ - 3.6, - 1.35 ] ) {

			const t = L.tAtSheerZ( z );
			list.push( ...cleat( V( s * ( L.sheerX( t ) - 0.04 ), L.sheerY( t ) + 0.048, z ), 0 ) );

		}

	}

	const tb = L.tAtSheerZ( 3.35 );
	list.push( ...cleat( V( 0, foredeckY( L, tb, 0 ), 3.35 ), Math.PI / 2, 0.24 ) );
	for ( const g of list ) kit.add( 'fittings', g, STAINLESS );

}

// ------------------------------------------------------------------ bow: stem head, roller, anchor

function buildBow( kit, L ) {

	const yTip = L.sheerY( 1 );
	// stem head fitting wrapping the bow tip
	const head = roundedBox( 0.09, 0.05, 0.3, 0.015, 2 );
	head.translate( 0, yTip + 0.03, L.zBow - 0.08 );
	kit.add( 'fittings', head, STAINLESS );
	for ( const s of [ 1, - 1 ] ) {

		const cheek = box( 0.008, 0.07, 0.16 );
		cheek.translate( s * 0.04, yTip + 0.08, L.zBow + 0.02 );
		kit.add( 'fittings', cheek, STAINLESS );

	}

	const roller = cylinder( 0.03, 0.03, 0.07, 12 );
	roller.applyMatrix4( mat4( 0, yTip + 0.085, L.zBow + 0.07, 0, 0, Math.PI / 2 ) );
	kit.add( 'fittings', roller, BLACK );

	// plow anchor stowed on the roller: shank over the roller, plowshare hanging against the stem
	const sa = V( 0, yTip + 0.1, L.zBow - 0.45 ), sb = V( 0, yTip + 0.12, L.zBow + 0.13 );
	kit.add( 'fittings', rod( sa, sb, 0.017, 8 ), GALV );
	const knuckle = cylinder( 0.025, 0.025, 0.07, 10 );
	knuckle.applyMatrix4( mat4( sb.x, sb.y, sb.z, 0, 0, Math.PI / 2 ) );
	kit.add( 'fittings', knuckle, GALV );
	const plowDir = V( 0, - 0.85, - 0.4 ).normalize();
	const plow = new ConeGeometry( 0.12, 0.34, 4 );
	plow.rotateY( Math.PI / 4 );
	plow.scale( 1, 1, 0.38 );
	plow.applyMatrix4( alignY( sb.clone().add( V( 0, - 0.02, 0.02 ) ).addScaledVector( plowDir, 0.17 ), plowDir ) );
	kit.add( 'fittings', plow, GALV );
	// rode running aft to the deck pipe
	const t = L.tAtSheerZ( L.zBow - 0.75 );
	const pipeY = foredeckY( L, t, 0 );
	const dp = cylinder( 0.035, 0.045, 0.04, 14 );
	dp.translate( 0, pipeY + 0.02, L.zBow - 0.75 );
	kit.add( 'fittings', dp, STAINLESS );
	kit.add( 'fittings', tube( [ sa, V( 0, lerp( sa.y, pipeY, 0.6 ) + 0.03, L.zBow - 0.6 ), V( 0, pipeY + 0.04, L.zBow - 0.75 ) ], 0.012, 10, 5 ), GALV );

}

// ------------------------------------------------------------------ bait tote and barrel

function buildContainers( kit, L ) {

	// bait tote beside the hauler
	const tote = new CylinderGeometry( 0.43, 0.37, 0.36, 4, 1 );
	tote.rotateY( Math.PI / 4 );
	tote.scale( 1, 1, 0.62 );
	tote.translate( - 0.72, L.deckY + 0.18, - 1.45 );
	kit.add( 'fittings', tote, { color: 0x2a64b0, rough: 0.55 } );
	const bait = box( 0.52, 0.02, 0.33 );
	bait.translate( - 0.72, L.deckY + 0.352, - 1.45 );
	kit.add( 'fittings', bait, { color: 0x5a2c22, rough: 0.35 } );

	// bait barrel against the port rail aft of the wheelhouse
	const bx = 0.86, bz = - 0.8;
	const barrel = cylinder( 0.26, 0.26, 0.78, 20 );
	barrel.translate( bx, L.deckY + 0.39, bz );
	kit.add( 'fittings', barrel, { color: 0x1f5ea6, rough: 0.5 } );
	for ( const y of [ 0.26, 0.52 ] ) {

		const rib = torus( 0.262, 0.012, 5, 24 );
		rib.applyMatrix4( mat4( bx, L.deckY + y, bz, Math.PI / 2, 0, 0 ) );
		kit.add( 'fittings', rib, { color: 0x1f5ea6, rough: 0.5 } );

	}

	const lid = cylinder( 0.27, 0.27, 0.03, 20 );
	lid.translate( bx, L.deckY + 0.795, bz );
	kit.add( 'fittings', lid, { color: 0x1b4f8c, rough: 0.5 } );

}

// ------------------------------------------------------------------ stern: light and ensign

const FLAG = { w: 0.5, h: 0.33 };

function buildStern( kit, L, parts ) {

	const y0 = L.sheerY( 0 ) + 0.045;
	const base = cylinder( 0.03, 0.035, 0.03, 12 );
	base.translate( 0, y0 + 0.015, L.zAft + 0.03 );
	kit.add( 'fittings', base, BLACK );
	const lens = cylinder( 0.025, 0.025, 0.05, 12 );
	lens.translate( 0, y0 + 0.055, L.zAft + 0.03 );
	kit.add( 'glow', lens, { color: 0xfff3dc, rough: 0.2, pattern: 0 } );
	const cap = cylinder( 0.03, 0.028, 0.012, 12 );
	cap.translate( 0, y0 + 0.086, L.zAft + 0.03 );
	kit.add( 'fittings', cap, BLACK );

	// flag staff in a socket at the starboard quarter
	const sx = - ( L.sheerX( 0.02 ) - 0.08 ), sz = L.zAft + 0.14;
	const top = y0 + 1.0;
	kit.add( 'fittings', rod( V( sx, y0 - 0.02, sz ), V( sx, top, sz ), 0.014, 8, 0.01 ), { color: 0xf1efe8, rough: 0.3 } );
	const finial = sphere( 0.02, 8, 6 );
	finial.translate( sx, top + 0.015, sz );
	kit.add( 'fittings', finial, { color: 0xc8a050, rough: 0.25, metal: 1 } );
	const socket = cylinder( 0.022, 0.026, 0.06, 10 );
	socket.translate( sx, y0 + 0.01, sz );
	kit.add( 'fittings', socket, STAINLESS );

	// flag: rest pose streams aft; the fittings material animates it (pattern 2)
	const { w, h } = FLAG;
	const nu = 12, nv = 6;
	const pos = [], uvs = [], idx = [];
	for ( let j = 0; j <= nv; j ++ ) {

		for ( let i = 0; i <= nu; i ++ ) {

			const u = i / nu, v = j / nv;
			pos.push( sx, top - 0.03 - h + v * h, sz - u * w );
			uvs.push( u, v );

		}

	}

	for ( let j = 0; j < nv; j ++ ) {

		for ( let i = 0; i < nu; i ++ ) {

			const a = j * ( nu + 1 ) + i, b = a + 1, c = a + nu + 2, d = a + nu + 1;
			idx.push( a, b, c, a, c, d );

		}

	}

	for ( const flip of [ false, true ] ) {

		const g = new BufferGeometry();
		g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
		g.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );
		const ix = flip ? idx.map( ( _, k ) => idx[ k - ( k % 3 ) + ( 2 - ( k % 3 ) ) ] ) : idx.slice();
		g.setIndex( ix );
		g.computeVertexNormals();
		auxVertices( g, ( p, k ) => [ 0.7, 0, 2, uvs[ k * 2 ] ] );
		kit.add( 'fittings', g, { color: 0xffffff } );

	}

	parts.flagPivot = V( sx, 0, sz );

}

return {buoyGeometry,buildDeckGear,TRAP,TRAPS,HAULER,FENDERS,FLAG};
})();
NS.Wheelhouse=(()=>{
const {BufferGeometry, CircleGeometry, Color, Float32BufferAttribute, Matrix4, PlaneGeometry, Vector2, Vector3} = ENG;
const {slab, loft, fanCap, box, roundedBox, cylinder, rod, sphere, torus, lathe, tube, prepare, mat4, alignY, auxVertices, paintVertices, mergePrepared,} = NS.GeoKit;
const {houseHalfWidth, foredeckY, PALETTE} = NS.HullBuilder;
const {lerp} = NS.HullLines;
const {buoyGeometry} = NS.DeckGear;

const V = ( x, y, z ) => new Vector3( x, y, z );

// Wheelhouse dimensions (boat frame)
const HOUSE = {
	wallT: 0.045,
	wsBottomY: 1.48, // windshield base
	wsTopY: 2.24,
	roofUnderY: 2.31,
	roofZ0: - 0.95,
	roofZ1: 1.34,
	winBottom: 1.56,
	winTop: 2.12,
	dash: { zFace: 0.98, yKnee: 1.08, zTop: 1.16, yTop: 1.4, zBack: 1.41, halfW: 1.1 },
	helmX: - 0.55,
	seatZ: 0.22,
};

const STAINLESS = { color: PALETTE.stainless, rough: 0.22, metal: 1 };
const BLACK_PLASTIC = { color: 0x1a1b1d, rough: 0.55, metal: 0 };
const WHITE_PAINT = { color: 0xf1f0eb, rough: 0.35, metal: 0 };
const FRAME = { color: 0xa4a8ab, rough: 0.55, metal: 1 }; // weathered, oxidised aluminium
const VINYL = { color: 0x1f2a3a, rough: 0.6, metal: 0 };

function wsZ( L, y ) {

	return L.houseFront - ( y - HOUSE.wsBottomY ) * ( 0.25 / 0.76 );

}

function wallX( L, z, y ) {

	return houseHalfWidth( L, z ) - Math.max( 0, y - 1.15 ) * 0.04;

}

function roofTopY( x ) {

	return 2.375 + 0.035 * ( 1 - ( x / 1.35 ) ** 2 );

}

// Offset a convex polygon (list of [u, v]) outward by d.
function offsetPoly( poly, d ) {

	const n = poly.length;
	const ccw = area2( poly ) > 0;
	const lines = [];
	for ( let i = 0; i < n; i ++ ) {

		const a = poly[ i ], b = poly[ ( i + 1 ) % n ];
		const ex = b[ 0 ] - a[ 0 ], ey = b[ 1 ] - a[ 1 ];
		const l = Math.hypot( ex, ey );
		let nx = ey / l, ny = - ex / l; // right-hand normal (outward for CCW)
		if ( ! ccw ) {

			nx = - nx; ny = - ny;

		}

		lines.push( [ a[ 0 ] + nx * d, a[ 1 ] + ny * d, ex, ey ] );

	}

	const out = [];
	for ( let i = 0; i < n; i ++ ) {

		const l1 = lines[ ( i + n - 1 ) % n ], l2 = lines[ i ];
		const den = l1[ 2 ] * l2[ 3 ] - l1[ 3 ] * l2[ 2 ];
		const s = ( ( l2[ 0 ] - l1[ 0 ] ) * l2[ 3 ] - ( l2[ 1 ] - l1[ 1 ] ) * l2[ 2 ] ) / den;
		out.push( [ l1[ 0 ] + l1[ 2 ] * s, l1[ 1 ] + l1[ 3 ] * s ] );

	}

	return out;

}

function area2( poly ) {

	let a = 0;
	for ( let i = 0; i < poly.length; i ++ ) {

		const p = poly[ i ], q = poly[ ( i + 1 ) % poly.length ];
		a += p[ 0 ] * q[ 1 ] - q[ 0 ] * p[ 1 ];

	}

	return a;

}

// Quad from four corner points (counter-clockwise seen from the front) with 0..1 or metric UVs.
function quad( a, b, c, d, uvs = [ 0, 0, 1, 0, 1, 1, 0, 1 ] ) {

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( [ a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z ], 3 ) );
	g.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( [ 0, 1, 2, 0, 2, 3 ] );
	g.computeVertexNormals();
	return g;

}

function buildWheelhouse( kit, L, parts ) {

	buildWalls( kit, L );
	buildWindshield( kit, L );
	buildRoof( kit, L );
	buildConsole( kit, L, parts );
	buildSeating( kit, L );
	buildCabinDetail( kit, L );
	buildRoofGear( kit, L, parts );

}

// ------------------------------------------------------------------ side walls

function sideWindowHoles( L ) {

	const { winBottom: y0, winTop: y1 } = HOUSE;
	const front = ( y ) => wsZ( L, y ) - 0.1;
	return [
		[ [ 0.3, y0 ], [ 0.78, y0 ], [ 0.78, y1 ], [ 0.3, y1 ] ],
		[ [ 0.84, y0 ], [ front( y0 ), y0 ], [ front( y1 ), y1 ], [ 0.84, y1 ] ],
	];

}

function buildWalls( kit, L ) {

	const { wallT, roofUnderY } = HOUSE;
	const z0 = L.houseBack, z1 = L.houseFront;
	const outline = [];
	const NB = 8;
	for ( let i = 0; i <= NB; i ++ ) {

		const z = lerp( z0, z1, i / NB );
		outline.push( [ z, L.sheerY( L.tAtSheerZ( z ) ) ] );

	}

	outline.push( [ z1, HOUSE.wsBottomY ] );
	outline.push( [ wsZ( L, roofUnderY ), roofUnderY ] );
	outline.push( [ z0, roofUnderY ] );
	const holes = sideWindowHoles( L );

	for ( const s of [ 1, - 1 ] ) {

		const map = ( u, v, side ) => V( s * ( wallX( L, u, v ) - side * wallT ), v, u );
		// the inner face is painted panelling (seams, screws, grime); the outside stays glossy gelcoat
		const wall = slab( outline, holes, map );
		auxVertices( wall, ( p ) => Math.abs( p.x ) < wallX( L, p.z, p.y ) - wallT * 0.5 ? [ 0.5, 0, 2, 0 ] : [ 0.3, 0, 0, 0 ] );
		kit.add( 'gelcoat', wall, { color: PALETTE.gelcoat } );

		for ( const h of holes ) {

			// aluminum frame ring through the wall, proud of both faces
			const outer = offsetPoly( h, 0.024 );
			const fmap = ( u, v, side ) => V( s * ( wallX( L, u, v ) + 0.008 - side * ( wallT + 0.016 ) ), v, u );
			kit.add( 'fittings', slab( outer, [ offsetPoly( h, - 0.006 ) ], fmap ), FRAME );

			// (no glass in the openings: the windows are left open)

			// black rubber gasket lining the opening, inside the frame ring
			const gmap = ( u, v, side ) => V( s * ( wallX( L, u, v ) + 0.004 - side * ( wallT + 0.008 ) ), v, u );
			kit.add( 'fittings', slab( offsetPoly( h, - 0.005 ), [ offsetPoly( h, - 0.014 ) ], gmap ), { color: 0x0e0f10, rough: 0.8 } );

			// pop rivets around the frame on the inside face
			const ring = offsetPoly( h, 0.011 );
			for ( let i = 0; i < ring.length; i ++ ) {

				const a = ring[ i ], b = ring[ ( i + 1 ) % ring.length ];
				const len = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] );
				const n = Math.max( 2, Math.round( len / 0.075 ) );
				for ( let k = 0; k < n; k ++ ) {

					const u = lerp( a[ 0 ], b[ 0 ], ( k + 0.5 ) / n ), v = lerp( a[ 1 ], b[ 1 ], ( k + 0.5 ) / n );
					const xr = s * ( wallX( L, u, v ) + 0.008 - ( wallT + 0.016 ) - 0.001 );
					const rv = cylinder( 0.0045, 0.0045, 0.003, 6 );
					rv.applyMatrix4( mat4( xr, v, u, 0, 0, Math.PI / 2 ) );
					kit.add( 'fittings', rv, { color: 0xc9ccd0, rough: 0.35, metal: 1 } );

				}

			}

		}

		// sliding-window latch
		const lz = 0.81, ly = 1.84;
		const lb = box( 0.02, 0.06, 0.025 );
		lb.translate( s * ( wallX( L, lz, ly ) - wallT - 0.012 ), ly, lz );
		kit.add( 'fittings', lb, BLACK_PLASTIC );

	}

	// house front below the windshield (coaming)
	const tF = L.tAtSheerZ( L.houseFront );
	const hw = houseHalfWidth( L, L.houseFront );
	const cOutline = [];
	for ( let i = 0; i <= 10; i ++ ) {

		const x = lerp( - hw, hw, i / 10 );
		cOutline.push( [ x, foredeckY( L, tF, x ) - 0.012 ] );

	}

	cOutline.push( [ hw, HOUSE.wsBottomY ], [ - hw, HOUSE.wsBottomY ] );
	const coaming = slab( cOutline, [], ( u, v, side ) => V( u, v, L.houseFront - side * 0.04 ) );
	auxVertices( coaming, ( p ) => p.z < L.houseFront - 0.02 ? [ 0.5, 0, 2, 0 ] : [ 0.3, 0, 0, 0 ] );
	kit.add( 'gelcoat', coaming, { color: PALETTE.gelcoat } );

}

// ------------------------------------------------------------------ windshield

function buildWindshield( kit, L ) {

	const { wsBottomY, roofUnderY } = HOUSE;
	const rake = new Vector3( 0, 0.76, - 0.25 ).normalize();
	const normal = new Vector3( 0, 0.25, 0.76 ).normalize();
	const base = V( 0, wsBottomY, L.houseFront );
	const vTop = ( roofUnderY - wsBottomY ) / rake.y;
	const at = ( u, v ) => base.clone().addScaledVector( rake, v ).setX( u );
	const halfAt = ( v ) => {

		const p = at( 0, v );
		return wallX( L, p.z, p.y );

	};

	const xb = halfAt( 0 ), xt = halfAt( vTop );
	const outline = [ [ - xb, 0 ], [ xb, 0 ], [ xt, vTop ], [ - xt, vTop ] ];
	const v0 = 0.07, v1 = 0.75;
	const holes = [
		[ [ - 0.36, v0 ], [ 0.36, v0 ], [ 0.36, v1 ], [ - 0.36, v1 ] ],
		[ [ 0.42, v0 ], [ halfAt( v0 ) - 0.09, v0 ], [ halfAt( v1 ) - 0.09, v1 ], [ 0.42, v1 ] ],
		[ [ - 0.42, v0 ], [ - 0.42, v1 ], [ - halfAt( v1 ) + 0.09, v1 ], [ - halfAt( v0 ) + 0.09, v0 ] ],
	];
	const T = 0.05;
	const map = ( u, v, side ) => at( u, v ).addScaledVector( normal, - side * T );
	kit.add( 'gelcoat', slab( outline, holes, map ), { color: PALETTE.gelcoat, rough: 0.3 } );

	for ( const h of holes ) {

		const outer = offsetPoly( h, 0.022 );
		kit.add( 'fittings', slab( outer, [ offsetPoly( h, - 0.006 ) ], ( u, v, side ) => at( u, v ).addScaledVector( normal, 0.008 - side * ( T + 0.016 ) ) ), FRAME );
		// (no glass: open windows)

	}

	// pantograph wipers on the centre and starboard panes
	for ( const [ u, ang ] of [ [ 0.0, 0.25 ], [ - 0.72, 0.2 ] ] ) {

		const pivot = at( u, v0 + 0.03 ).addScaledVector( normal, 0.012 );
		const dir = rake.clone().applyAxisAngle( normal, ang );
		const blade = rod( pivot, pivot.clone().addScaledVector( dir, 0.52 ), 0.006, 5 );
		kit.add( 'fittings', blade, BLACK_PLASTIC );
		kit.add( 'fittings', rod( pivot.clone().addScaledVector( normal, - 0.01 ), pivot.clone().addScaledVector( normal, 0.012 ), 0.014, 8 ), BLACK_PLASTIC );

	}

}

// ------------------------------------------------------------------ roof

function roofHalf( L, z ) {

	const zc = Math.min( Math.max( z, L.houseBack ), 1.18 );
	let hw = wallX( L, zc, HOUSE.roofUnderY ) + 0.09;
	const rc = 0.22;
	const d = Math.min( z - HOUSE.roofZ0, HOUSE.roofZ1 - z );
	if ( d < rc ) hw -= rc - Math.sqrt( Math.max( 0, rc * rc - ( rc - d ) ** 2 ) );
	return hw;

}

function buildRoof( kit, L ) {

	const yb = HOUSE.roofUnderY;
	const N = 22;
	const profiles = [];
	// cluster stations near both ends for the rounded corners, plus a pair on each end wall of the
	// wheelhouse so the headliner pattern (per-vertex aux) switches inside the wall, not across the roof
	const zs = [];
	for ( let i = 0; i <= N; i ++ ) {

		const f = i / N;
		const g = 0.5 - 0.5 * Math.cos( Math.PI * f );
		zs.push( lerp( HOUSE.roofZ0, HOUSE.roofZ1, lerp( f, g, 0.6 ) ) );

	}

	for ( const zw of [ L.houseBack, L.houseFront ] ) for ( const dz of [ - 0.012, 0.012 ] ) {

		const z = zw + dz;
		if ( z > HOUSE.roofZ0 + 0.02 && z < HOUSE.roofZ1 - 0.02 ) zs.push( z );

	}

	zs.sort( ( a, b ) => a - b );
	for ( const z of zs ) {

		const hw = roofHalf( L, z );
		// inner face of the side wall under the roof (the headliner ends there)
		const wIn = wallX( L, Math.min( Math.max( z, L.houseBack ), L.houseFront ), yb ) - HOUSE.wallT;
		const half = [
			[ 0, yb ], [ wIn * 0.5, yb ], [ wIn - 0.01, yb ], [ wIn + 0.01, yb ], [ hw - 0.03, yb ], [ hw - 0.008, yb + 0.008 ], [ hw, yb + 0.025 ],
			[ hw - 0.004, roofTopY( hw ) - 0.012 ], [ hw - 0.02, roofTopY( hw ) ], [ hw * 0.75, roofTopY( hw * 0.75 ) ],
			[ hw * 0.5, roofTopY( hw * 0.5 ) ], [ hw * 0.25, roofTopY( hw * 0.25 ) ], [ 0, roofTopY( 0 ) ],
		];
		const loop = half.map( ( p ) => V( p[ 0 ], p[ 1 ], z ) );
		for ( let k = half.length - 2; k >= 1; k -- ) loop.push( V( - half[ k ][ 0 ], half[ k ][ 1 ], z ) );
		profiles.push( loop );

	}

	const N2 = profiles.length - 1;
	const g = loft( profiles, { closed: true } );
	orientOutwardFn( g, ( p ) => V( p.x, p.y - 2.345, 0 ) );
	metricUV( g, ( p ) => [ p.x, p.z ] );
	// non-skid on top; the underside is headliner over the wheelhouse, gelcoat on the overhangs
	auxVertices( g, ( p ) => {

		if ( p.y > yb + 0.03 ) return [ 0.35, 0, 1, 0 ];
		const inside = p.z > L.houseBack && p.z < L.houseFront && Math.abs( p.x ) < wallX( L, Math.min( Math.max( p.z, L.houseBack ), L.houseFront ), yb ) - HOUSE.wallT;
		return [ 0.35, 0, inside ? 3 : 0, 0 ];

	} );
	kit.add( 'gelcoat', g, { color: PALETTE.gelcoat } );
	kit.add( 'gelcoat', fanCap( profiles[ 0 ], V( 0, 0, - 1 ) ), { color: PALETTE.gelcoat, rough: 0.3 } );
	kit.add( 'gelcoat', fanCap( profiles[ N2 ], V( 0, 0, 1 ) ), { color: PALETTE.gelcoat, rough: 0.3 } );

	// stainless grab rails along the roof edges
	for ( const s of [ 1, - 1 ] ) {

		const x = s * 1.1;
		const y = roofTopY( 1.1 ) + 0.07;
		kit.add( 'fittings', rod( V( x, y, - 0.7 ), V( x, y, 0.95 ), 0.013, 8 ), STAINLESS );
		for ( const z of [ - 0.7, - 0.12, 0.45, 0.95 ] ) kit.add( 'fittings', rod( V( x, roofTopY( 1.1 ) - 0.01, z ), V( x, y, z ), 0.011, 6 ), STAINLESS );

	}

}

function orientOutwardFn( g, fn ) {

	const p = g.attributes.position, n = g.attributes.normal;
	let dot = 0;
	const a = V( 0, 0, 0 ), b = V( 0, 0, 0 );
	for ( let i = 0; i < p.count; i ++ ) {

		a.fromBufferAttribute( p, i ); b.fromBufferAttribute( n, i );
		dot += b.dot( fn( a ) );

	}

	if ( dot < 0 ) {

		const idx = Array.from( g.index.array );
		for ( let i = 0; i < idx.length; i += 3 ) {

			const t = idx[ i + 1 ]; idx[ i + 1 ] = idx[ i + 2 ]; idx[ i + 2 ] = t;

		}

		g.setIndex( idx );
		g.computeVertexNormals();

	}

}

function metricUV( g, fn ) {

	const p = g.attributes.position;
	const uv = new Float32Array( p.count * 2 );
	const v = V( 0, 0, 0 );
	for ( let i = 0; i < p.count; i ++ ) {

		v.fromBufferAttribute( p, i );
		const t = fn( v );
		uv[ i * 2 ] = t[ 0 ]; uv[ i * 2 + 1 ] = t[ 1 ];

	}

	g.setAttribute( 'uv', new Float32BufferAttribute( uv, 2 ) );

}

// ------------------------------------------------------------------ console, helm, instruments

// Slope of the instrument panel (from the knee to the dash top).
function panelFrame() {

	const d = HOUSE.dash;
	const B = new Vector2( d.zFace, d.yKnee ), C = new Vector2( d.zTop, d.yTop );
	const dir = C.clone().sub( B ).normalize(); // (dz, dy)
	const along = V( 0, dir.y, dir.x ); // up the panel
	const normal = V( 0, dir.x, - dir.y ); // toward the helmsman (up and aft)
	const at = ( x, f ) => V( x, lerp( B.y, C.y, f ), lerp( B.x, C.x, f ) );
	return { along, normal, at, length: B.distanceTo( C ), angle: Math.atan2( dir.x, dir.y ) };

}

function buildConsole( kit, L, parts ) {

	const d = HOUSE.dash;
	// console body; its ends follow the hull lining where the flared hull narrows toward the bow
	const corners = [ [ d.zFace, L.deckY ], [ d.zFace, d.yKnee ], [ d.zTop, d.yTop ], [ d.zBack, d.yTop ], [ d.zBack, L.deckY ] ];
	const outline = [];
	for ( let i = 0; i < corners.length; i ++ ) {

		const a = corners[ i ], b = corners[ ( i + 1 ) % corners.length ];
		for ( let k = 0; k < 6; k ++ ) outline.push( [ lerp( a[ 0 ], b[ 0 ], k / 6 ), lerp( a[ 1 ], b[ 1 ], k / 6 ) ] );

	}

	const endX = ( z, y ) => Math.min( d.halfW, L.halfBreadth( L.tAtSheerZ( z ), Math.min( y, L.sheerY( L.tAtSheerZ( z ) ) ) ) - L.shell - 0.004 );
	const body = slab( outline, [], ( u, v, side ) => V( ( side ? - 1 : 1 ) * endX( u, v ), v, u ) );
	auxVertices( body, () => [ 0.5, 0, 2, 0 ] );
	kit.add( 'gelcoat', body, { color: PALETTE.gelcoat } );

	// anti-glare dash top and instrument panel
	const top = box( d.halfW * 2 - 0.01, 0.01, d.zBack - d.zTop );
	top.translate( 0, d.yTop + 0.005, ( d.zBack + d.zTop ) / 2 );
	kit.add( 'gelcoat', top, { color: 0x2a2c2f, rough: 0.85 } );

	const pf = panelFrame();
	const panel = box( d.halfW * 2 - 0.04, pf.length - 0.02, 0.012 );
	panel.applyMatrix4( mat4( 0, 0, 0, pf.angle, 0, 0 ) );
	panel.translate( ...pf.at( 0, 0.5 ).addScaledVector( pf.normal, 0.004 ).toArray() );
	kit.add( 'fittings', panel, { color: 0x1d1f22, rough: 0.7, pattern: 4 } );

	// teak fiddle rail along the dash top edge
	const fr = box( d.halfW * 2 - 0.02, 0.03, 0.022 );
	fr.translate( 0, d.yTop + 0.02, d.zTop + 0.011 );
	kit.add( 'wood', fr, { rough: 0.3 } );

	// gauges (bezel + backlit dial)
	for ( const [ x, f ] of [ [ - 0.76, 0.72 ], [ - 0.34, 0.72 ], [ - 0.55, 0.9 ], [ - 0.12, 0.5 ], [ 0.02, 0.5 ] ] ) {

		const c = pf.at( x, f ).addScaledVector( pf.normal, 0.012 );
		const m = new Matrix4().makeBasis( V( - 1, 0, 0 ), pf.along, pf.normal ).setPosition( c );
		const bezel = torus( 0.043, 0.006, 4, 16 );
		bezel.applyMatrix4( m );
		kit.add( 'fittings', bezel, STAINLESS );
		const dial = new CircleGeometry( 0.042, 20 );
		// 3 mm proud of the panel face (was coplanar with it: z-fighting)
