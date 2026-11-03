			if ( Math.abs( det ) < 1e-12 ) return;
			for ( let kk = k0; kk <= k1; kk ++ ) {

				const pz = z0 + ( kk + 0.5 ) * cell;
				for ( let ii = i0; ii <= i1; ii ++ ) {

					const px = x0 + ( ii + 0.5 ) * cell;
					const l1 = ( ( b[ 2 ] - c[ 2 ] ) * ( px - c[ 0 ] ) + ( c[ 0 ] - b[ 0 ] ) * ( pz - c[ 2 ] ) ) / det;
					const l2 = ( ( c[ 2 ] - a[ 2 ] ) * ( px - c[ 0 ] ) + ( a[ 0 ] - c[ 0 ] ) * ( pz - c[ 2 ] ) ) / det;
					const l3 = 1 - l1 - l2;
					if ( l1 < - 1e-9 || l2 < - 1e-9 || l3 < - 1e-9 ) continue;
					const y = l1 * a[ 1 ] + l2 * b[ 1 ] + l3 * c[ 1 ];
					const idx = kk * nx + ii;
					if ( y < bottom[ idx ] ) bottom[ idx ] = y;

				}

			}

		};

		const A = [ 0, 0, 0 ], B = [ 0, 0, 0 ], C = [ 0, 0, 0 ], Dp = [ 0, 0, 0 ];
		const get = ( row, j, out ) => {

			out[ 0 ] = row[ 3 * j ]; out[ 1 ] = row[ 3 * j + 1 ]; out[ 2 ] = row[ 3 * j + 2 ];
			return out;

		};

		for ( let i = 0; i < NT; i ++ ) {

			for ( let j = 0; j < nj - 1; j ++ ) {

				get( grid[ i ], j, A ); get( grid[ i + 1 ], j, B ); get( grid[ i + 1 ], j + 1, C ); get( grid[ i ], j + 1, Dp );
				tri( A, B, C ); tri( A, C, Dp );

			}

		}

		this._field = { bottom, nx, nz, cell, x0, z0 };

		// Waterplane area, displaced volume, centers.
		let area = 0, volume = 0, mz = 0, vz = 0, vy = 0;
		for ( let kk = 0; kk < nz; kk ++ ) {

			const pz = z0 + ( kk + 0.5 ) * cell;
			for ( let ii = 0; ii < nx; ii ++ ) {

				const y = bottom[ kk * nx + ii ];
				if ( ! ( y < 0 ) ) continue;
				const dA = cell * cell * 2;
				area += dA;
				mz += dA * pz;
				volume += dA * - y;
				vz += dA * - y * pz;
				vy += dA * - y * ( y * 0.5 );

			}

		}

		this.waterplaneArea = area;
		this.canoeVolume = volume;
		this.centerOfFlotationZ = mz / area;
		this.centerOfBuoyancy = new Vector3( 0, vy / volume, vz / volume );

	}

	// Waterplane half-beam at longitudinal position z (0 outside the waterline).
	halfBeamAt( z ) {

		if ( z < this.wlStart || z > this.wlEnd ) return 0;
		const f = ( z - this._tableZ0 ) / this._tableDz;
		const i = Math.min( this._beamTable.length - 2, Math.max( 0, Math.floor( f ) ) );
		return lerp( this._beamTable[ i ], this._beamTable[ i + 1 ], clamp01( f - i ) );

	}

	// Canoe-body depth below the waterline (at the centerline) at z, 0 outside.
	draftAt( z ) {

		const { bottom, nx, nz, cell, z0 } = this._field;
		const f = ( z - z0 ) / cell - 0.5;
		if ( f < - 0.5 || f > nz - 0.5 ) return 0;
		const k = Math.min( nz - 2, Math.max( 0, Math.floor( f ) ) );
		const a = bottom[ k * nx ], b = bottom[ ( k + 1 ) * nx ];
		const da = a < 0 ? - a : 0, db = b < 0 ? - b : 0;
		return lerp( da, db, clamp01( f - k ) );

	}

	// Hull bottom height (canoe body) at (x, z); +Infinity outside the immersed footprint.
	bottomAt( x, z ) {

		const { bottom, nx, nz, cell, x0, z0 } = this._field;
		const i = Math.floor( ( Math.abs( x ) - x0 ) / cell ), k = Math.floor( ( z - z0 ) / cell );
		if ( i < 0 || i >= nx || k < 0 || k >= nz ) return Infinity;
		return bottom[ k * nx + i ];

	}

	// Buoyancy samples: `slices` longitudinal slices x 4 lateral strips (two per side).
	// Each sample carries the waterplane area of its patch; its y is the mean hull
	// depth of the patch, so sum(area * -y) equals the displaced canoe-body volume,
	// and x sits at the patch's radius of gyration so roll stiffness is preserved.
	buildHullSamples( slices = 8 ) {

		const { bottom, nx, nz, cell, x0, z0 } = this._field;
		const L = this.wlEnd - this.wlStart;
		const acc = [];
		for ( let s = 0; s < slices; s ++ ) acc.push( [ 0, 1 ].map( () => ( { a: 0, x2: 0, z: 0, v: 0 } ) ) );

		for ( let kk = 0; kk < nz; kk ++ ) {

			const pz = z0 + ( kk + 0.5 ) * cell;
			const s = Math.min( slices - 1, Math.max( 0, Math.floor( ( pz - this.wlStart ) / L * slices ) ) );
			const hb = this.halfBeamAt( pz );
			for ( let ii = 0; ii < nx; ii ++ ) {

				const y = bottom[ kk * nx + ii ];
				if ( ! ( y < 0 ) ) continue;
				const px = x0 + ( ii + 0.5 ) * cell;
				const strip = hb > 0 && px > hb * 0.5 ? 1 : 0;
				const dA = cell * cell;
				const c = acc[ s ][ strip ];
				c.a += dA; c.x2 += dA * px * px; c.z += dA * pz; c.v += dA * - y;

			}

		}

		const samples = [];
		for ( let s = 0; s < slices; s ++ ) {

			for ( let strip = 0; strip < 2; strip ++ ) {

				const c = acc[ s ][ strip ];
				if ( c.a <= 0 ) continue;
				const x = Math.sqrt( c.x2 / c.a ), z = c.z / c.a, y = - c.v / c.a;
				const bottomY = Math.min( 0, this.bottomAt( x, z ) );
				samples.push( { position: new Vector3( x, y, z ), area: c.a, depth: - y, bottomY } );
				samples.push( { position: new Vector3( - x, y, z ), area: c.a, depth: - y, bottomY } );

			}

		}

		return samples;

	}

}

// Centripetal Catmull-Rom between p1 and p2.
function catmullRom( p0, p1, p2, p3, u, out ) {

	const d01 = Math.max( 1e-5, Math.sqrt( Math.hypot( p1[ 0 ] - p0[ 0 ], p1[ 1 ] - p0[ 1 ] ) ) );
	const d12 = Math.max( 1e-5, Math.sqrt( Math.hypot( p2[ 0 ] - p1[ 0 ], p2[ 1 ] - p1[ 1 ] ) ) );
	const d23 = Math.max( 1e-5, Math.sqrt( Math.hypot( p3[ 0 ] - p2[ 0 ], p3[ 1 ] - p2[ 1 ] ) ) );
	const t0 = 0, t1 = d01, t2 = t1 + d12, t3 = t2 + d23;
	const t = t1 + ( t2 - t1 ) * u;

	for ( let c = 0; c < 2; c ++ ) {

		const a1 = ( ( t1 - t ) * p0[ c ] + ( t - t0 ) * p1[ c ] ) / ( t1 - t0 );
		const a2 = ( ( t2 - t ) * p1[ c ] + ( t - t1 ) * p2[ c ] ) / ( t2 - t1 );
		const a3 = ( ( t3 - t ) * p2[ c ] + ( t - t2 ) * p3[ c ] ) / ( t3 - t2 );
		const b1 = ( ( t2 - t ) * a1 + ( t - t0 ) * a2 ) / ( t2 - t0 );
		const b2 = ( ( t3 - t ) * a2 + ( t - t1 ) * a3 ) / ( t3 - t1 );
		out[ c ] = ( ( t2 - t ) * b1 + ( t - t1 ) * b2 ) / ( t2 - t1 );

	}

	return out;

}


return {RHO_SEAWATER,HullLines,sstep,lerp,clamp01};
})();
NS.HullBuilder=(()=>{
const {BufferGeometry, Float32BufferAttribute, Vector3} = ENG;
const {gridSurface, loft, fanCap, orientTowards, slab, box, rod, tube, auxVertices} = NS.GeoKit;
const {sstep, lerp} = NS.HullLines;

// Colors (sRGB hex; GeoKit converts to linear)
const PALETTE = {
	gelcoat: 0xf1eee6,
	lining: 0xe9e6dc,
	deck: 0xe2ddcf,
	antifouling: 0x7a1d15,
	stainless: 0xd0d3d6,
};

const V = ( x, y, z ) => new Vector3( x, y, z );

function buildHull( kit, L ) {

	buildShell( kit, L );
	buildKeel( kit, L );
	buildLining( kit, L );
	buildDecks( kit, L );
	buildGunwale( kit, L );
	buildRubrail( kit, L );

}

// ------------------------------------------------------------------ outer shell + transom

function buildShell( kit, L ) {

	const ts = L.stationParams( 60 );
	const rows = ts.map( ( t ) => L.station( t, 1 ) );
	const uvFn = ( p ) => [ p.z, p.y ];
	kit.add( 'hull', gridSurface( rows, { uvFn } ) );
	const mirrored = rows.map( ( r ) => r.map( ( p ) => V( - p.x, p.y, p.z ) ) );
	kit.add( 'hull', gridSurface( mirrored, { flip: true, uvFn } ) );

	// transom: strips between the port and starboard halves of the t = 0 section
	const sec = rows[ 0 ];
	const pos = [], idx = [], uvs = [];
	for ( const p of sec ) {

		pos.push( p.x, p.y, p.z, - p.x, p.y, p.z );
		uvs.push( p.x, p.y, - p.x, p.y );

	}

	for ( let j = 0; j < sec.length - 1; j ++ ) {

		const a = 2 * j, b = 2 * j + 1, c = 2 * j + 2, d = 2 * j + 3;
		if ( sec[ j ].x > 1e-5 ) idx.push( a, b, c );
		idx.push( b, d, c );

	}

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( idx );
	orientTowards( g, V( 0, 0, - 1 ) );
	g.computeVertexNormals();
	fixUnusedNormals( g, V( 0, 0, - 1 ) );
	kit.add( 'hull', g );

}

// Closed low-poly hull envelope: both shell halves, transom and a flat lid at the sheer.
function buildHullVolume( L ) {

	const ts = L.stationParams( 28 );
	const rows = ts.map( ( t ) => L.station( t, 1 ).filter( ( _, j, a ) => j % 2 === 0 || j === a.length - 1 ) );
	const nj = rows[ 0 ].length;
	const pos = [], idx = [];
	const vert = ( p ) => {

		pos.push( p.x, p.y, p.z );
		return pos.length / 3 - 1;

	};

	const port = rows.map( ( r ) => r.map( vert ) );
	const star = rows.map( ( r ) => r.map( ( p ) => vert( V( - p.x, p.y, p.z ) ) ) );
	for ( let i = 0; i < rows.length - 1; i ++ ) {

		for ( let j = 0; j < nj - 1; j ++ ) {

			const a = port[ i ][ j ], b = port[ i + 1 ][ j ], c = port[ i + 1 ][ j + 1 ], d = port[ i ][ j + 1 ];
			idx.push( a, d, b, d, c, b );
			const a2 = star[ i ][ j ], b2 = star[ i + 1 ][ j ], c2 = star[ i + 1 ][ j + 1 ], d2 = star[ i ][ j + 1 ];
			idx.push( a2, b2, d2, b2, c2, d2 );

		}

	}

	// transom
	for ( let j = 0; j < nj - 1; j ++ ) idx.push( port[ 0 ][ j ], star[ 0 ][ j ], port[ 0 ][ j + 1 ], star[ 0 ][ j ], star[ 0 ][ j + 1 ], port[ 0 ][ j + 1 ] );
	// lid: strip between the port and starboard sheer lines
	const top = nj - 1;
	for ( let i = 0; i < rows.length - 1; i ++ ) idx.push( port[ i ][ top ], star[ i ][ top ], port[ i + 1 ][ top ], star[ i ][ top ], star[ i + 1 ][ top ], port[ i + 1 ][ top ] );

	// drop zero-area triangles where the halves meet (keel line, stem head)
	const same = ( i, k ) => Math.abs( pos[ 3 * i ] - pos[ 3 * k ] ) + Math.abs( pos[ 3 * i + 1 ] - pos[ 3 * k + 1 ] ) + Math.abs( pos[ 3 * i + 2 ] - pos[ 3 * k + 2 ] ) < 1e-7;
	const clean = [];
	for ( let i = 0; i < idx.length; i += 3 ) {

		const [ a, b, c ] = [ idx[ i ], idx[ i + 1 ], idx[ i + 2 ] ];
		if ( ! same( a, b ) && ! same( b, c ) && ! same( a, c ) ) clean.push( a, b, c );

	}

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setIndex( clean );
	g.computeVertexNormals();
	g.computeBoundingBox();
	g.computeBoundingSphere();
	return g;

}

// ------------------------------------------------------------------ keel, shoe, shaft log

// Keel bottom profile (z, y): shallow at the forefoot, deepest at the prop aperture.
const KEEL_PROFILE = [ [ 3.74, - 0.093 ], [ 3.3, - 0.2 ], [ 3.0, - 0.265 ], [ 1.5, - 0.5 ], [ 0, - 0.62 ], [ - 1.5, - 0.7 ], [ - 3.05, - 0.77 ] ];

function keelBottomAt( z ) {

	const P = KEEL_PROFILE;
	if ( z >= P[ 0 ][ 0 ] ) return P[ 0 ][ 1 ];
	if ( z <= P[ P.length - 1 ][ 0 ] ) return P[ P.length - 1 ][ 1 ];
	let i = 0;
	while ( i < P.length - 2 && z < P[ i + 1 ][ 0 ] ) i ++;
	const p0 = P[ Math.max( 0, i - 1 ) ], p1 = P[ i ], p2 = P[ i + 1 ], p3 = P[ Math.min( P.length - 1, i + 2 ) ];
	const f = ( p1[ 0 ] - z ) / ( p1[ 0 ] - p2[ 0 ] );
	// uniform Catmull-Rom on y
	const f2 = f * f, f3 = f2 * f;
	return 0.5 * ( 2 * p1[ 1 ] + ( - p0[ 1 ] + p2[ 1 ] ) * f + ( 2 * p0[ 1 ] - 5 * p1[ 1 ] + 4 * p2[ 1 ] - p3[ 1 ] ) * f2 + ( - p0[ 1 ] + 3 * p1[ 1 ] - 3 * p2[ 1 ] + p3[ 1 ] ) * f3 );

}

const KEEL = { zFront: 3.74, zAft: - 3.05, shoeAft: - 3.68, bottom: - 0.77, shoeTop: - 0.74 };

function buildKeel( kit, L ) {

	const N = 32;
	const profiles = [];
	for ( let i = 0; i <= N; i ++ ) {

		const f = i / N;
		const z = lerp( KEEL.zAft, KEEL.zFront, Math.pow( f, 0.9 ) );
		const yB = keelBottomAt( z );
		const canoe = - L.draftAt( z );
		const yTop = Math.max( canoe + 0.06, yB + 0.02 );
		const fwd = sstep( 2.6, KEEL.zFront, z );
		const wt = lerp( 0.065, 0.012, fwd );
		const wb = lerp( 0.042, 0.008, fwd );
		const mid = lerp( yTop, yB, 0.55 );
		const half = [
			[ wt, yTop ], [ lerp( wt, wb, 0.6 ), mid ], [ wb, yB + 0.035 ], [ wb * 0.75, yB + 0.012 ], [ wb * 0.35, yB + 0.002 ],
		];
		const prof = [];
		for ( const h of half ) prof.push( V( h[ 0 ], h[ 1 ], z ) );
		prof.push( V( 0, yB, z ) );
		for ( let k = half.length - 1; k >= 0; k -- ) prof.push( V( - half[ k ][ 0 ], half[ k ][ 1 ], z ) );
		profiles.push( prof );

	}

	const g = loft( profiles );
	orientOutward( g, ( p ) => V( p.x, 0, 0 ), V( 0, - 1, 0 ) );
	kit.add( 'hull', g );
	kit.add( 'hull', fanCap( profiles[ 0 ], V( 0, 0, - 1 ) ) );
	kit.add( 'hull', fanCap( profiles[ N ], V( 0, 0, 1 ) ) );

	// shoe under the prop aperture carrying the rudder heel
	const shoeLen = KEEL.zAft - KEEL.shoeAft;
	const shoe = box( 0.075, KEEL.shoeTop - KEEL.bottom, shoeLen );
	shoe.translate( 0, ( KEEL.shoeTop + KEEL.bottom ) / 2, ( KEEL.zAft + KEEL.shoeAft ) / 2 );
	kit.add( 'hull', shoe );

	// heel bearing and shaft
	kit.add( 'fittings', rod( V( 0, KEEL.shoeTop, - 3.58 ), V( 0, KEEL.shoeTop + 0.03, - 3.58 ), 0.03, 10 ), { color: 0xb0764a, rough: 0.4, metal: 1 } );
	kit.add( 'fittings', rod( V( 0, - 0.53, KEEL.zAft + 0.02 ), V( 0, - 0.53, - 3.27 ), 0.024, 10 ), { color: 0xc9ccd0, rough: 0.25, metal: 1 } );
	// stern tube boss where the shaft leaves the keel
	kit.add( 'hull', rod( V( 0, - 0.53, KEEL.zAft + 0.06 ), V( 0, - 0.53, KEEL.zAft - 0.03 ), 0.05, 12, 0.04 ) );

}

// Volume of the keel appendage and shoe below the canoe body (m^3).
function keelVolume( L ) {

	const N = 240;
	const dz = ( KEEL.zFront - KEEL.zAft ) / N;
	let v = 0;
	for ( let i = 0; i < N; i ++ ) {

		const z = KEEL.zAft + ( i + 0.5 ) * dz;
		const h = Math.max( 0, - L.draftAt( z ) - keelBottomAt( z ) );
		const fwd = sstep( 2.6, KEEL.zFront, z );
		v += ( lerp( 0.065, 0.012, fwd ) + lerp( 0.042, 0.008, fwd ) ) * h * dz;

	}

	return v + 0.075 * ( KEEL.shoeTop - KEEL.bottom ) * ( KEEL.zAft - KEEL.shoeAft );

}

// Vertices not referenced by any triangle get a sane normal.
function fixUnusedNormals( g, n ) {

	const nrm = g.attributes.normal;
	for ( let i = 0; i < nrm.count; i ++ ) {

		if ( Math.hypot( nrm.getX( i ), nrm.getY( i ), nrm.getZ( i ) ) < 0.5 ) nrm.setXYZ( i, n.x, n.y, n.z );

	}

}

// Flip a geometry so normals point along outward(p) on average.
function orientOutward( g, outwardFn, fallback ) {

	const p = g.attributes.position, n = g.attributes.normal;
	let dot = 0;
	const a = V( 0, 0, 0 ), b = V( 0, 0, 0 );
	for ( let i = 0; i < p.count; i ++ ) {

		a.fromBufferAttribute( p, i );
		b.fromBufferAttribute( n, i );
		const o = outwardFn( a );
		dot += o.lengthSq() > 1e-10 ? b.dot( o ) : b.dot( fallback );

	}

	if ( dot < 0 ) {

		const idx = Array.from( g.index.array );
		for ( let i = 0; i < idx.length; i += 3 ) {

			const t = idx[ i + 1 ]; idx[ i + 1 ] = idx[ i + 2 ]; idx[ i + 2 ] = t;

		}

		g.setIndex( idx );
		g.computeVertexNormals();

	}

	return g;

}

// ------------------------------------------------------------------ inner lining (bulwarks)

function innerX( L, t, y ) {

	return L.halfBreadth( t, y ) - L.shell;

}

function buildLining( kit, L ) {

	const tA = L.shell / L.length;
	const tF = L.tAtSheerZ( L.houseFront );
	const NS = 40, NY = 7;
	const rows = [];
	for ( let i = 0; i <= NS; i ++ ) {

		const t = lerp( tA, tF, i / NS );
		const z = L.sheerZ( t );
		const yTop = L.sheerY( t );
		const row = [];
		for ( let k = 0; k <= NY; k ++ ) {

			const y = lerp( L.deckY, yTop, k / NY );
			row.push( V( innerX( L, t, y ), y, z ) );

		}

		rows.push( row );

	}

	const uvFn = ( p ) => [ p.z, p.y ];
	// port lining faces -x (inboard)
	const port = gridSurface( rows, { uvFn, flip: true } );
	const star = gridSurface( rows.map( ( r ) => r.map( ( p ) => V( - p.x, p.y, p.z ) ) ), { uvFn } );
	kit.add( 'gelcoat', port, { color: PALETTE.lining, rough: 0.4 } );
	kit.add( 'gelcoat', star, { color: PALETTE.lining, rough: 0.4 } );

	// inner face of the transom
	const zT = L.zAft + L.shell;
	const pos = [], uvs = [], idx = [];
	for ( let k = 0; k <= NY; k ++ ) {

		const y = lerp( L.deckY, L.sheerY( tA ), k / NY );
		const x = innerX( L, tA, y );
		pos.push( x, y, zT, - x, y, zT );
		uvs.push( x, y, - x, y );

	}

	for ( let k = 0; k < NY; k ++ ) {

		const a = 2 * k, b = 2 * k + 1, c = 2 * k + 2, d = 2 * k + 3;
		idx.push( a, c, b, b, c, d );

	}

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( idx );
	orientTowards( g, V( 0, 0, 1 ) );
	g.computeVertexNormals();
	kit.add( 'gelcoat', g, { color: PALETTE.lining, rough: 0.4 } );

}

// ------------------------------------------------------------------ decks

function foredeckY( L, t, x ) {

	const xe = Math.max( 1e-3, L.sheerX( t ) - L.shell );
	const f = Math.min( 1, Math.abs( x ) / xe );
	return L.sheerY( t ) + 0.06 * ( 1 - f * f );

}

function buildDecks( kit, L ) {

	const tA = L.shell / L.length;
	const tF = L.tAtSheerZ( L.houseFront );
	const grip = { color: PALETTE.deck, rough: 0.5, pattern: 1 };
	const uvFn = ( p ) => [ p.x, p.z ];

	// cockpit / wheelhouse sole (y = deckY), edges follow the lining
	const NS = 40, NX = 8;
	const sole = [];
	for ( let i = 0; i <= NS; i ++ ) {

		const t = lerp( tA, tF, i / NS );
		const z = L.sheerZ( t );
		const xe = innerX( L, t, L.deckY );
		const row = [];
		for ( let k = 0; k <= NX; k ++ ) row.push( V( lerp( xe, - xe, k / NX ), L.deckY, z ) );
		sole.push( row );

	}

	const gs = gridSurface( sole, { uvFn } );
	orientTowards( gs, V( 0, 1, 0 ) );
	gs.computeVertexNormals();
	kit.add( 'gelcoat', gs, grip );

	// cambered foredeck from the wheelhouse front to the stem head
	const NF = 30, NFX = 12;
	let tDeckEnd = 1;
	while ( L.sheerX( tDeckEnd ) - L.shell < 0.012 ) tDeckEnd -= 0.0005;
	const fore = [];
	for ( let i = 0; i <= NF; i ++ ) {

		const t = lerp( tF, tDeckEnd, 1 - Math.pow( 1 - i / NF, 1.3 ) );
		const z = L.sheerZ( t );
		const xe = Math.max( 0.012, L.sheerX( t ) - L.shell );
		const row = [];
		for ( let k = 0; k <= NFX; k ++ ) {

			const x = lerp( xe, - xe, k / NFX );
			row.push( V( x, foredeckY( L, t, x ), z ) );

		}

		fore.push( row );

	}

	const gf = gridSurface( fore, { uvFn } );
	orientTowards( gf, V( 0, 1, 0 ) );
	gf.computeVertexNormals();
	kit.add( 'gelcoat', gf, grip );

	// side decks (washboards) alongside the wheelhouse
	for ( const s of [ 1, - 1 ] ) {

		const outline = [];
		const NZ = 12;
		const z0 = L.houseBack, z1 = L.houseFront;
		for ( let i = 0; i <= NZ; i ++ ) {

			const z = lerp( z0, z1, i / NZ );
			outline.push( [ z, houseHalfWidth( L, z ) - 0.045 ] );

		}

		for ( let i = NZ; i >= 0; i -- ) {

			const z = lerp( z0, z1, i / NZ );
			outline.push( [ z, L.sheerX( L.tAtSheerZ( z ) ) - L.shell + 0.01 ] );

		}

		const g = slab( outline, [], ( u, v, side ) => {

			const t = L.tAtSheerZ( u );
			return V( s * v, L.sheerY( t ) - ( side ? 0.04 : 0 ), u );

		} );
		auxVertices( g, ( p ) => [ 0.5, 0, p.y > L.sheerY( L.tAtSheerZ( p.z ) ) - 0.02 ? 1 : 0, 0 ] );
		kit.add( 'gelcoat', g, { color: PALETTE.deck } );

	}

	// deck hatch frame
	const hy = L.deckY + 0.008;
	for ( const [ w, d, x, z ] of [ [ 0.74, 0.03, 0, - 1.25 ], [ 0.74, 0.03, 0, - 1.95 ], [ 0.03, 0.73, 0.355, - 1.6 ], [ 0.03, 0.73, - 0.355, - 1.6 ] ] ) {

		const b = box( w, 0.016, d );
		b.translate( x, hy, z );
		kit.add( 'gelcoat', b, { color: 0xd6d1c4, rough: 0.45 } );

	}

	// flush hatch lifting ring
	kit.add( 'fittings', rod( V( - 0.05, L.deckY + 0.004, - 1.45 ), V( 0.05, L.deckY + 0.004, - 1.45 ), 0.006, 6 ), { color: PALETTE.stainless, rough: 0.3, metal: 1 } );

}

function houseHalfWidth( L, z ) {

	return L.sheerX( L.tAtSheerZ( z ) ) - 0.2;

}

// ------------------------------------------------------------------ gunwale caps (wood)

const CAP_H = 0.045;

function capProfile( xi, xo, y0, z, sign ) {

	const xm = ( xi + xo ) / 2;
	const pts = [
		[ xi, y0 - 0.012 ], [ xi, y0 + CAP_H - 0.012 ], [ xi + 0.01, y0 + CAP_H - 0.002 ], [ xm, y0 + CAP_H + 0.004 ],
		[ xo - 0.01, y0 + CAP_H - 0.002 ], [ xo, y0 + CAP_H - 0.012 ], [ xo, y0 - 0.026 ], [ xo - 0.018, y0 - 0.03 ],
	];
	return pts.map( ( p ) => V( sign * Math.max( 0, p[ 0 ] ), p[ 1 ], z ) );

}

function buildGunwale( kit, L ) {

	const tStart = ( L.shell + 0.03 ) / L.length;
	const N = 60;
	for ( const s of [ 1, - 1 ] ) {

		const profiles = [];
		for ( let i = 0; i <= N; i ++ ) {

			const t = lerp( tStart, 1, 1 - Math.pow( 1 - i / N, 1.25 ) );
			const xs = L.sheerX( t );
			let z = L.sheerZ( t );
			let xo = xs + 0.022;
			if ( i === N ) {

				xo = 0; z += 0.03;

			}

			profiles.push( capProfile( Math.max( 0, xs - L.shell - 0.03 ), xo, L.sheerY( t ), z, s ) );

		}

		const g = loft( profiles );
		orientOutward( g, ( p ) => V( p.x - s * ( L.sheerX( L.tAtSheerZ( p.z ) ) - 0.03 ), p.y - L.sheerY( L.tAtSheerZ( p.z ) ) - 0.01, 0 ), V( 0, 1, 0 ) );
		woodUV( g, profiles );
		kit.add( 'wood', g, { rough: 0.32 } );
		kit.add( 'wood', fanCap( profiles[ 0 ], V( 0, 0, - 1 ) ), { rough: 0.32 } );

	}

	// transom cap
	const y0 = L.sheerY( 0 );
	const xo = L.sheerX( 0 ) + 0.022;
	const zi = L.zAft + L.shell + 0.03, zo = L.zAft - 0.022;
	const prof = ( x ) => capProfile( 0, zi - zo, 0, 0, 1 ).map( ( p ) => V( x, y0 + p.y, zi - p.x ) );
	const tprofiles = [];
	for ( let i = 0; i <= 8; i ++ ) tprofiles.push( prof( lerp( - xo, xo, i / 8 ) ) );
	const tg = loft( tprofiles );
	orientOutward( tg, ( p ) => V( 0, p.y - y0 - 0.01, p.z - ( zi + zo ) / 2 ), V( 0, 1, 0 ) );
	woodUV( tg, tprofiles );
	kit.add( 'wood', tg, { rough: 0.32 } );
	kit.add( 'wood', fanCap( tprofiles[ 0 ], V( - 1, 0, 0 ) ), { rough: 0.32 } );
	kit.add( 'wood', fanCap( tprofiles[ 8 ], V( 1, 0, 0 ) ), { rough: 0.32 } );

}

// u along the sweep (meters), v around the profile (meters) so grain runs lengthwise.
function woodUV( g, profiles ) {

	const nj = profiles[ 0 ].length;
	const uv = g.attributes.uv;
	let u = 0;
	for ( let i = 0; i < profiles.length; i ++ ) {

		if ( i > 0 ) u += profiles[ i ][ 3 ].distanceTo( profiles[ i - 1 ][ 3 ] );
		let v = 0;
		for ( let j = 0; j < nj; j ++ ) {

			if ( j > 0 ) v += profiles[ i ][ j ].distanceTo( profiles[ i ][ j - 1 ] );
			uv.setXY( i * nj + j, u, v );

		}

	}

}

// ------------------------------------------------------------------ rubrail (wood + stainless strip)

function buildRubrail( kit, L ) {

	const N = 50;
	const ANG = [ - 90, - 60, - 30, 0, 30, 60, 90 ].map( ( a ) => a * Math.PI / 180 );
	for ( const s of [ 1, - 1 ] ) {

		const centers = [];
		for ( let i = 0; i <= N; i ++ ) {

			const t = lerp( 0.0, 0.992, 1 - Math.pow( 1 - i / N, 1.25 ) );
			const y = L.sheerY( t ) - 0.07;
			const x = L.halfBreadth( t, y );
			centers.push( V( x, y, L.zOnStation( t, y ) ) );

		}

		const profiles = [];
		const strip = [];
		for ( let i = 0; i <= N; i ++ ) {

			const c = centers[ i ];
			const a = centers[ Math.max( 0, i - 1 ) ], b = centers[ Math.min( N, i + 1 ) ];
			// horizontal outward normal of the rail line
			const dz = b.z - a.z, dx = b.x - a.x;
			const len = Math.hypot( dx, dz ) || 1;
			const nx = dz / len, nz = - dx / len;
			const prof = ANG.map( ( ang ) => {

				const o = 0.036 * Math.cos( ang ) - 0.006;
				return V( s * ( c.x + nx * o ), c.y + 0.03 * Math.sin( ang ), c.z + nz * o );

			} );
			profiles.push( prof );
			strip.push( V( s * ( c.x + nx * 0.034 ), c.y, c.z + nz * 0.034 ) );

		}

		const g = loft( profiles );
		orientOutward( g, () => V( s, 0, 0 ), V( s, 0, 0 ) );
		woodUV( g, profiles );
		kit.add( 'wood', g, { rough: 0.35 } );
		kit.add( 'wood', fanCap( profiles[ 0 ], V( 0, 0, - 1 ) ), { rough: 0.35 } );
		kit.add( 'wood', fanCap( profiles[ N ], V( 0, 0, 1 ) ), { rough: 0.35 } );
		kit.add( 'fittings', tube( strip, 0.0065, 64, 4 ), { color: PALETTE.stainless, rough: 0.22, metal: 1 } );

	}

	// across the transom
	const y = L.sheerY( 0 ) - 0.07;
	const xo = L.sheerX( 0 ) + 0.015;
	const tprof = [];
	for ( let i = 0; i <= 6; i ++ ) {

		const x = lerp( - xo, xo, i / 6 );
		tprof.push( ANG.map( ( ang ) => V( x, y + 0.03 * Math.sin( ang ), L.zAft - ( 0.036 * Math.cos( ang ) - 0.006 ) ) ) );

	}

	const tg = loft( tprof );
	orientOutward( tg, ( p ) => V( 0, 0, p.z - L.zAft + 0.001 ), V( 0, 0, - 1 ) );
	woodUV( tg, tprof );
	kit.add( 'wood', tg, { rough: 0.35 } );
	kit.add( 'wood', fanCap( tprof[ 0 ], V( - 1, 0, 0 ) ), { rough: 0.35 } );
	kit.add( 'wood', fanCap( tprof[ 6 ], V( 1, 0, 0 ) ), { rough: 0.35 } );

}

return {PALETTE,buildHull,buildHullVolume,keelBottomAt,KEEL,keelVolume,foredeckY,houseHalfWidth};
})();
NS.DeckGear=(()=>{
const {BufferGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Vector3} = ENG;
const {box, roundedBox, cylinder, rod, sphere, torus, lathe, tube, mat4, alignY, auxVertices} = NS.GeoKit;
const {foredeckY, PALETTE} = NS.HullBuilder;
const {lerp} = NS.HullLines;

const V = ( x, y, z ) => new Vector3( x, y, z );

const STAINLESS = { color: PALETTE.stainless, rough: 0.22, metal: 1 };
const GALV = { color: 0xa3a7ab, rough: 0.35, metal: 1 };
const BLACK = { color: 0x1a1b1d, rough: 0.55, metal: 0 };

// Maine lobster buoy (foam bullet in the owner's colours) with its spindle stick.
// Returns [geometry, options] pairs for the fittings bucket; origin at the buoy's base.
function buoyGeometry( colors = [ 0xff6a13, 0xf4f1ea, 0x1d4f9c ], stick = 0.35 ) {

	const bands = [
		[ [ 0, 0 ], [ 0.03, 0.004 ], [ 0.055, 0.025 ], [ 0.07, 0.07 ], [ 0.075, 0.12 ], [ 0.075, 0.17 ] ],
		[ [ 0.075, 0.17 ], [ 0.075, 0.22 ], [ 0.075, 0.27 ] ],
		[ [ 0.075, 0.27 ], [ 0.074, 0.33 ], [ 0.068, 0.39 ], [ 0.052, 0.435 ], [ 0.03, 0.455 ], [ 0, 0.46 ] ],
	];
	const out = bands.map( ( b, i ) => [ lathe( b, 12 ), { color: colors[ i ], rough: 0.55 } ] );
	out.push( [ cylinder( 0.011, 0.013, 0.46 + stick + 0.06, 6 ).translate( 0, ( 0.46 + stick - 0.06 ) / 2, 0 ), { color: 0x9c7a4c, rough: 0.75 } ] );
	return out;

}

function buildDeckGear( kit, L, parts ) {

	buildTraps( kit, L );
	buildHauler( kit, L );
	buildCoils( kit, L );
	buildBuoys( kit, L );
	buildFenders( kit, L );
	buildCleats( kit, L );
	buildBow( kit, L );
	buildContainers( kit, L );
	buildStern( kit, L, parts );

}

// ------------------------------------------------------------------ lobster traps

// A face quad (meters UV) for the trap bucket; aux carries the face size for the frame border.
function trapFace( a, b, c, d, w, h, pattern = 0 ) {

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( [ a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z ], 3 ) );
	g.setAttribute( 'uv', new Float32BufferAttribute( [ 0, 0, w, 0, w, h, 0, h ], 2 ) );
	g.setIndex( [ 0, 1, 2, 0, 2, 3 ] );
	g.computeVertexNormals();
	return { g, opts: { rough: w, metal: h, pattern } };

}

const TRAP = { L: 0.95, W: 0.55, H: 0.37 };

// Traps on deck: [x, y (bottom), z, yaw, colour]
const TRAPS = [
	[ 0.66, 0, - 3.25, 0.02, 0xd8b21c ],
	[ 0.66, 1, - 3.23, - 0.03, 0x2f7a3c ],
	[ 0.64, 0, - 2.2, - 0.04, 0xd8b21c ],
	[ - 0.68, 0, - 3.25, 0.03, 0x1f2326 ],
];

function buildTraps( kit, L ) {

	const { L: TL, W, H } = TRAP;
	for ( const [ x, level, z, yaw, col ] of TRAPS ) {

		const y0 = L.deckY + 0.03 + level * ( H + 0.035 );
		const m = mat4( x, y0, z, 0, yaw, 0 );
		const add = ( f, color = col ) => {

			f.g.applyMatrix4( m );
			kit.add( 'trap', f.g, { ...f.opts, color } );

		};

		const hw = W / 2, hl = TL / 2;
		// box faces
		add( trapFace( V( - hw, 0, hl ), V( hw, 0, hl ), V( hw, H, hl ), V( - hw, H, hl ), W, H ) );
		add( trapFace( V( hw, 0, - hl ), V( - hw, 0, - hl ), V( - hw, H, - hl ), V( hw, H, - hl ), W, H ) );
		add( trapFace( V( hw, 0, hl ), V( hw, 0, - hl ), V( hw, H, - hl ), V( hw, H, hl ), TL, H ) );
		add( trapFace( V( - hw, 0, - hl ), V( - hw, 0, hl ), V( - hw, H, hl ), V( - hw, H, - hl ), TL, H ) );
		add( trapFace( V( - hw, H, hl ), V( hw, H, hl ), V( hw, H, - hl ), V( - hw, H, - hl ), W, TL ) );
		add( trapFace( V( - hw, 0, - hl ), V( hw, 0, - hl ), V( hw, 0, hl ), V( - hw, 0, hl ), W, TL ) );
		// parlor divider
		add( trapFace( V( - hw, 0, 0.08 ), V( hw, 0, 0.08 ), V( hw, H, 0.08 ), V( - hw, H, 0.08 ), W, H ) );

		// net heads funneling in from both sides of the kitchen
		const net = 0x264f6e;
		for ( const s of [ 1, - 1 ] ) {

			const zc = - 0.2, yc = H * 0.5;
			const o = [ V( s * hw, yc - 0.12, zc - 0.15 ), V( s * hw, yc - 0.12, zc + 0.15 ), V( s * hw, yc + 0.12, zc + 0.15 ), V( s * hw, yc + 0.12, zc - 0.15 ) ];
			const i = [ V( s * 0.07, yc - 0.045, zc - 0.06 ), V( s * 0.07, yc - 0.045, zc + 0.06 ), V( s * 0.07, yc + 0.045, zc + 0.06 ), V( s * 0.07, yc + 0.045, zc - 0.06 ) ];
			for ( let k = 0; k < 4; k ++ ) {

				const k1 = ( k + 1 ) % 4;
				add( trapFace( o[ k ], o[ k1 ], i[ k1 ], i[ k ], o[ k ].distanceTo( o[ k1 ] ), o[ k ].distanceTo( i[ k ] ), 1 ), net );

			}

		}

		// runners (weathered oak) and ballast bricks
		for ( const rx of [ - 0.2, 0, 0.2 ] ) {

			// top 4 mm above the wire floor, bottom 2 mm above the deck (both were coplanar: z-fighting)
			const r = box( 0.05, 0.032, TL + 0.02 );
			r.translate( rx, - 0.012, 0 );
			r.applyMatrix4( m );
			kit.add( 'wood', r, { color: 0x9a9a92, rough: 0.8 } );

		}

		for ( const bz of [ - 0.3, 0.3 ] ) {

			const b = box( 0.2, 0.06, 0.09 );
			b.translate( 0.05, 0.035, bz );
			b.applyMatrix4( m );
			kit.add( 'fittings', b, { color: 0x8e3a26, rough: 0.9 } );

		}

