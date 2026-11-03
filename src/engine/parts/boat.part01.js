// @ts-nocheck

import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
const ENG={...THREE,RoundedBoxGeometry,mergeGeometries},NS={};
NS.GeoKit=(()=>{
const {BoxGeometry, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, Euler, Float32BufferAttribute, LatheGeometry, Matrix4, Quaternion, ShapeUtils, SphereGeometry, TorusGeometry, TubeGeometry, Vector2, Vector3, RoundedBoxGeometry, mergeGeometries} = ENG;

// Geometry helpers for the procedural boat. Every geometry is normalized to the
// same attribute layout so parts can be merged per material:
//   position, normal, uv (meters where it matters), color (linear RGB),
//   aux = (roughness, metalness, pattern id, animation weight)

const KEEP = new Set( [ 'position', 'normal', 'uv', 'color', 'aux' ] );
const _color = new Color();
const _v = new Vector3();
const _q = new Quaternion();
const _e = new Euler();
const _s = new Vector3();

function mat4( x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx, order = 'XYZ' ) {

	_e.set( rx, ry, rz, order );
	_q.setFromEuler( _e );
	return new Matrix4().compose( _v.set( x, y, z ), _q, _s.set( sx, sy, sz ) );

}

// Matrix placing the local +Y axis along `dir` at `pos`.
function alignY( pos, dir, roll = 0 ) {

	const d = dir.clone().normalize();
	const q = new Quaternion().setFromUnitVectors( new Vector3( 0, 1, 0 ), d );
	if ( roll ) q.multiply( new Quaternion().setFromAxisAngle( new Vector3( 0, 1, 0 ), roll ) );
	return new Matrix4().compose( pos, q, new Vector3( 1, 1, 1 ) );

}

function linearColor( c ) {

	return c instanceof Color ? c : _color.set( c ).clone();

}

function prepare( geo, { color = 0xffffff, rough = 0.5, metal = 0, pattern = 0, anim = 0, matrix = null } = {} ) {

	for ( const name of Object.keys( geo.attributes ) ) if ( ! KEEP.has( name ) ) geo.deleteAttribute( name );
	geo.morphAttributes = {};
	geo.clearGroups();

	const n = geo.attributes.position.count;
	if ( ! geo.index ) {

		const idx = new Array( n );
		for ( let i = 0; i < n; i ++ ) idx[ i ] = i;
		geo.setIndex( idx );

	}

	if ( ! geo.attributes.normal ) geo.computeVertexNormals();
	if ( ! geo.attributes.uv ) geo.setAttribute( 'uv', new Float32BufferAttribute( new Float32Array( n * 2 ), 2 ) );

	if ( ! geo.attributes.color ) {

		const c = linearColor( color );
		const arr = new Float32Array( n * 3 );
		for ( let i = 0; i < n; i ++ ) {

			arr[ i * 3 ] = c.r; arr[ i * 3 + 1 ] = c.g; arr[ i * 3 + 2 ] = c.b;

		}

		geo.setAttribute( 'color', new Float32BufferAttribute( arr, 3 ) );

	}

	if ( ! geo.attributes.aux ) {

		const arr = new Float32Array( n * 4 );
		for ( let i = 0; i < n; i ++ ) {

			arr[ i * 4 ] = rough; arr[ i * 4 + 1 ] = metal; arr[ i * 4 + 2 ] = pattern; arr[ i * 4 + 3 ] = anim;

		}

		geo.setAttribute( 'aux', new Float32BufferAttribute( arr, 4 ) );

	}

	// uniform float layout for merging
	for ( const name of Object.keys( geo.attributes ) ) {

		const a = geo.attributes[ name ];
		if ( ! ( a.array instanceof Float32Array ) || a.isInterleavedBufferAttribute ) {

			geo.setAttribute( name, new Float32BufferAttribute( Float32Array.from( { length: a.count * a.itemSize }, ( _, i ) => a.array[ i ] ), a.itemSize ) );

		}

	}

	if ( matrix ) geo.applyMatrix4( matrix );
	return geo;

}

// Collects geometries per material bucket and merges them.
class GeoKit {

	constructor() {

		this.buckets = new Map();

	}

	add( bucket, geometry, opts ) {

		const g = prepare( geometry, opts );
		if ( ! this.buckets.has( bucket ) ) this.buckets.set( bucket, [] );
		this.buckets.get( bucket ).push( g );
		return g;

	}

	merged( bucket ) {

		const list = this.buckets.get( bucket );
		if ( ! list || list.length === 0 ) return null;
		const g = list.length === 1 ? list[ 0 ] : mergeGeometries( list, false );
		if ( ! g ) throw new Error( 'BoatModel: failed to merge bucket ' + bucket );
		g.computeBoundingBox();
		g.computeBoundingSphere();
		return g;

	}

}

// Merge a list of prepared geometries into one (for animated parts).
function mergePrepared( list ) {

	const g = list.length === 1 ? list[ 0 ] : mergeGeometries( list, false );
	g.computeBoundingBox();
	g.computeBoundingSphere();
	return g;

}

// ------------------------------------------------------------------ primitives

// Box with UVs in meters.
function box( w, h, d ) {

	const g = new BoxGeometry( w, h, d );
	const uv = g.attributes.uv;
	// face order: px, nx, py, ny, pz, nz (4 vertices each)
	const dims = [ [ d, h ], [ d, h ], [ w, d ], [ w, d ], [ w, h ], [ w, h ] ];
	for ( let f = 0; f < 6; f ++ ) {

		for ( let i = 0; i < 4; i ++ ) {

			const k = f * 4 + i;
			uv.setXY( k, uv.getX( k ) * dims[ f ][ 0 ], uv.getY( k ) * dims[ f ][ 1 ] );

		}

	}

	return g;

}

function roundedBox( w, h, d, radius = 0.02, segments = 2 ) {

	const g = new RoundedBoxGeometry( w, h, d, segments, Math.min( radius, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4 ) );
	const uv = g.attributes.uv;
	for ( let i = 0; i < uv.count; i ++ ) uv.setXY( i, uv.getX( i ) * Math.max( w, d ), uv.getY( i ) * h );
	return g;

}

function cylinder( rTop, rBottom, h, radial = 12, heightSegs = 1, open = false, thetaStart = 0, thetaLength = Math.PI * 2 ) {

	const g = new CylinderGeometry( rTop, rBottom, h, radial, heightSegs, open, thetaStart, thetaLength );
	const uv = g.attributes.uv;
	const circ = Math.max( rTop, rBottom ) * thetaLength;
	for ( let i = 0; i < uv.count; i ++ ) uv.setXY( i, uv.getX( i ) * circ, uv.getY( i ) * h );
	return g;

}

// Cylinder between two points.
function rod( a, b, radius, radial = 8, rEnd = radius ) {

	const dir = new Vector3().subVectors( b, a );
	const len = dir.length();
	const g = cylinder( rEnd, radius, len, radial, 1, false );
	g.applyMatrix4( alignY( new Vector3().addVectors( a, b ).multiplyScalar( 0.5 ), dir ) );
	return g;

}

function sphere( r, w = 12, h = 8, phiStart = 0, phiLength = Math.PI * 2, thetaStart = 0, thetaLength = Math.PI ) {

	return new SphereGeometry( r, w, h, phiStart, phiLength, thetaStart, thetaLength );

}

function torus( R, r, radial = 8, tubular = 24, arc = Math.PI * 2 ) {

	const g = new TorusGeometry( R, r, radial, tubular, arc );
	const uv = g.attributes.uv;
	for ( let i = 0; i < uv.count; i ++ ) uv.setXY( i, uv.getX( i ) * R * arc, uv.getY( i ) * 2 * Math.PI * r );
	return g;

}

// Lathe around +Y from [ [r, y], ... ] (bottom to top).
function lathe( profile, segments = 16 ) {

	const pts = profile.map( ( p ) => new Vector2( Math.max( 0, p[ 0 ] ), p[ 1 ] ) );
	const g = new LatheGeometry( pts, segments );
	// three's lathe winds so normals face outward for bottom-to-top profiles
	return g;

}

function tube( points, radius, tubular = 32, radial = 6, closed = false, tension = 0.5 ) {

	const curve = new CatmullRomCurve3( points, closed, 'catmullrom', tension );
	const g = new TubeGeometry( curve, tubular, radius, radial, closed );
	const len = curve.getLength();
	const uv = g.attributes.uv;
	for ( let i = 0; i < uv.count; i ++ ) uv.setXY( i, uv.getX( i ) * len, uv.getY( i ) );
	return g;

}

// Indexed surface from rows[i][j] (Vector3). `flip` reverses the winding.
// UVs: u = distance along i (first column), v = distance along j (first row).
function gridSurface( rows, { flip = false, uvFn = null, closeJ = false } = {} ) {

	const ni = rows.length, nj = rows[ 0 ].length;
	const pos = new Float32Array( ni * nj * 3 );
	const uvs = new Float32Array( ni * nj * 2 );
	let u = 0;
	for ( let i = 0; i < ni; i ++ ) {

		if ( i > 0 ) u += rows[ i ][ 0 ].distanceTo( rows[ i - 1 ][ 0 ] );
		let v = 0;
		for ( let j = 0; j < nj; j ++ ) {

			const p = rows[ i ][ j ];
			if ( j > 0 ) v += p.distanceTo( rows[ i ][ j - 1 ] );
			const k = i * nj + j;
			pos[ k * 3 ] = p.x; pos[ k * 3 + 1 ] = p.y; pos[ k * 3 + 2 ] = p.z;
			if ( uvFn ) {

				const t = uvFn( p, i, j, u, v );
				uvs[ k * 2 ] = t[ 0 ]; uvs[ k * 2 + 1 ] = t[ 1 ];

			} else {

				uvs[ k * 2 ] = u; uvs[ k * 2 + 1 ] = v;

			}

		}

	}

	const idx = [];
	const jmax = closeJ ? nj : nj - 1;
	for ( let i = 0; i < ni - 1; i ++ ) {

		for ( let j = 0; j < jmax; j ++ ) {

			const j1 = ( j + 1 ) % nj;
			const a = i * nj + j, b = ( i + 1 ) * nj + j, c = ( i + 1 ) * nj + j1, d = i * nj + j1;
			if ( flip ) idx.push( a, b, d, b, c, d );
			else idx.push( a, d, b, d, c, b );

		}

	}

	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );
	g.setIndex( idx );
	g.computeVertexNormals();
	return g;

}

// Flat polygon (Vector3 loop, assumed planar-ish and convex-ish) as a fan from its centroid.
function fanCap( loop, normalHint ) {

	const c = new Vector3();
	for ( const p of loop ) c.add( p );
	c.divideScalar( loop.length );
	const pos = [ c.x, c.y, c.z ];
	for ( const p of loop ) pos.push( p.x, p.y, p.z );
	const idx = [];
	for ( let i = 0; i < loop.length; i ++ ) idx.push( 0, 1 + i, 1 + ( ( i + 1 ) % loop.length ) );
	const g = new BufferGeometry();
	g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
	g.setIndex( idx );
	orientTowards( g, normalHint );
	g.computeVertexNormals();
	planarUV( g, normalHint );
	return g;

}

// Flip all triangles if their average normal disagrees with `dir`.
function orientTowards( g, dir ) {

	const p = g.attributes.position, idx = g.index.array;
	const a = new Vector3(), b = new Vector3(), c = new Vector3(), n = new Vector3(), acc = new Vector3();
	for ( let i = 0; i < idx.length; i += 3 ) {

		a.fromBufferAttribute( p, idx[ i ] ); b.fromBufferAttribute( p, idx[ i + 1 ] ); c.fromBufferAttribute( p, idx[ i + 2 ] );
		n.subVectors( b, a ).cross( c.sub( a ) );
		acc.add( n );

	}

	if ( acc.dot( dir ) < 0 ) {

		const arr = Array.from( idx );
		for ( let i = 0; i < arr.length; i += 3 ) {

			const t = arr[ i + 1 ]; arr[ i + 1 ] = arr[ i + 2 ]; arr[ i + 2 ] = t;

		}

		g.setIndex( arr );

	}

	return g;

}

// Planar projection UVs (meters) perpendicular to `normal`.
function planarUV( g, normal ) {

	const n = normal.clone().normalize();
	const t = Math.abs( n.y ) > 0.9 ? new Vector3( 1, 0, 0 ) : new Vector3( 0, 1, 0 ).cross( n ).normalize();
	const b = new Vector3().crossVectors( n, t );
	const p = g.attributes.position;
	const uv = new Float32Array( p.count * 2 );
	const v = new Vector3();
	for ( let i = 0; i < p.count; i ++ ) {

		v.fromBufferAttribute( p, i );
		uv[ i * 2 ] = v.dot( t ); uv[ i * 2 + 1 ] = v.dot( b );

	}

	g.setAttribute( 'uv', new Float32BufferAttribute( uv, 2 ) );
	return g;

}

// Solid panel from a 2D outline (u, v in meters) with optional holes.
// map( u, v, side ) -> Vector3 gives the point on the front (side 0) or back (side 1) face.
// Faces are oriented automatically (front faces away from the back face, edges outward).
function slab( outline, holes, map, { edges = true, back = true, front = true } = {} ) {

	const contour = outline.map( ( p ) => new Vector2( p[ 0 ], p[ 1 ] ) );
	const holeVs = holes.map( ( h ) => h.map( ( p ) => new Vector2( p[ 0 ], p[ 1 ] ) ) );
	if ( ShapeUtils.isClockWise( contour ) ) contour.reverse();
	for ( const h of holeVs ) if ( ! ShapeUtils.isClockWise( h ) ) h.reverse();
	const tris = ShapeUtils.triangulateShape( contour, holeVs );
	const all = contour.concat( ...holeVs );

	const parts = [];
	const faceGeo = ( side ) => {

		const pos = [], uvs = [];
		for ( const p of all ) {

			const q = map( p.x, p.y, side );
			pos.push( q.x, q.y, q.z );
			uvs.push( p.x, p.y );

		}

		// drop zero-area triangles (earcut emits them for collinear outline points)
		const idx = [];
		for ( const t of tris ) {

			const a = all[ t[ 0 ] ], b = all[ t[ 1 ] ], c = all[ t[ 2 ] ];
			if ( Math.abs( ( b.x - a.x ) * ( c.y - a.y ) - ( c.x - a.x ) * ( b.y - a.y ) ) > 1e-10 ) idx.push( t[ 0 ], t[ 1 ], t[ 2 ] );

		}

		const g = new BufferGeometry();
		g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
		g.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );
		g.setIndex( idx );
		// orient: front normal points from back face toward front face
		const c = contour[ 0 ];
		const dir = map( c.x, c.y, side ).sub( map( c.x, c.y, 1 - side ) );
		orientTowards( g, dir );
		g.computeVertexNormals();
		// vertices left without triangles get the face direction
		const nrm = g.attributes.normal;
		dir.normalize();
		for ( let i = 0; i < nrm.count; i ++ ) {

			if ( Math.hypot( nrm.getX( i ), nrm.getY( i ), nrm.getZ( i ) ) < 0.5 ) nrm.setXYZ( i, dir.x, dir.y, dir.z );

		}

		return g;

	};

	if ( front ) parts.push( faceGeo( 0 ) );
	if ( back ) parts.push( faceGeo( 1 ) );

	if ( edges ) {

		const pos = [], uvs = [], idx = [];
		const loops = [ contour, ...holeVs ];
		const a0 = new Vector3(), a1 = new Vector3(), b0 = new Vector3(), b1 = new Vector3();
		const n = new Vector3(), out = new Vector3();
		for ( const loop of loops ) {

			let len = 0;
			for ( let i = 0; i < loop.length; i ++ ) {

				const p = loop[ i ], q = loop[ ( i + 1 ) % loop.length ];
				const el = p.distanceTo( q );
				if ( el < 1e-6 ) continue;
				a0.copy( map( p.x, p.y, 0 ) ); a1.copy( map( p.x, p.y, 1 ) );
				b0.copy( map( q.x, q.y, 0 ) ); b1.copy( map( q.x, q.y, 1 ) );
				const th = a0.distanceTo( a1 );
				const base = pos.length / 3;
				pos.push( a0.x, a0.y, a0.z, b0.x, b0.y, b0.z, b1.x, b1.y, b1.z, a1.x, a1.y, a1.z );
				uvs.push( len, 0, len + el, 0, len + el, th, len, th );
				len += el;
				// outward direction: right-hand side of the edge for CCW outline / CW holes
				const mx = ( p.x + q.x ) / 2, my = ( p.y + q.y ) / 2;
				const ox = ( q.y - p.y ) / el * 0.01, oy = - ( q.x - p.x ) / el * 0.01;
				out.copy( map( mx + ox, my + oy, 0 ) ).sub( map( mx, my, 0 ) );
				n.subVectors( b0, a0 ).cross( _v.subVectors( a1, a0 ) );
				if ( n.dot( out ) >= 0 ) idx.push( base, base + 1, base + 2, base, base + 2, base + 3 );
				else idx.push( base, base + 2, base + 1, base, base + 3, base + 2 );

			}

		}

		if ( pos.length ) {

			const g = new BufferGeometry();
			g.setAttribute( 'position', new Float32BufferAttribute( pos, 3 ) );
			g.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );
			g.setIndex( idx );
			g.computeVertexNormals();
			parts.push( g );

		}

	}

	return parts.length === 1 ? parts[ 0 ] : mergeGeometries( parts, false );

}

// Loft of profile loops/strips: profiles[i] = array of Vector3 (same length).
// `closed` joins the last profile point to the first (duplicating the seam so UVs
// stay continuous; seam normals are averaged).
function loft( profiles, { closed = false, flip = false } = {} ) {

	const rows = closed ? profiles.map( ( r ) => [ ...r, r[ 0 ].clone() ] ) : profiles;
	const g = gridSurface( rows, { flip } );
	if ( closed ) {

		const nj = rows[ 0 ].length;
		const nrm = g.attributes.normal;
		const a = new Vector3(), b = new Vector3();
		for ( let i = 0; i < rows.length; i ++ ) {

			const i0 = i * nj, i1 = i * nj + nj - 1;
			a.fromBufferAttribute( nrm, i0 ); b.fromBufferAttribute( nrm, i1 );
			a.add( b ).normalize();
			nrm.setXYZ( i0, a.x, a.y, a.z ); nrm.setXYZ( i1, a.x, a.y, a.z );

		}

	}

	return g;

}

// Assign per-vertex colors with a function of the vertex position.
function paintVertices( g, fn ) {

	const p = g.attributes.position;
	const arr = new Float32Array( p.count * 3 );
	const v = new Vector3();
	for ( let i = 0; i < p.count; i ++ ) {

		v.fromBufferAttribute( p, i );
		const c = linearColor( fn( v, i ) );
		arr[ i * 3 ] = c.r; arr[ i * 3 + 1 ] = c.g; arr[ i * 3 + 2 ] = c.b;

	}

	g.setAttribute( 'color', new Float32BufferAttribute( arr, 3 ) );
	return g;

}

// Per-vertex aux attribute with a function returning [rough, metal, pattern, anim].
function auxVertices( g, fn ) {

	const p = g.attributes.position;
	const arr = new Float32Array( p.count * 4 );
	const v = new Vector3();
	for ( let i = 0; i < p.count; i ++ ) {

		v.fromBufferAttribute( p, i );
		const a = fn( v, i );
		arr[ i * 4 ] = a[ 0 ]; arr[ i * 4 + 1 ] = a[ 1 ]; arr[ i * 4 + 2 ] = a[ 2 ]; arr[ i * 4 + 3 ] = a[ 3 ];

	}

	g.setAttribute( 'aux', new Float32BufferAttribute( arr, 4 ) );
	return g;

}

function triangleCount( g ) {

	return g.index ? g.index.count / 3 : g.attributes.position.count / 3;

}

return {mat4,alignY,linearColor,prepare,GeoKit,mergePrepared,box,roundedBox,cylinder,rod,sphere,torus,lathe,tube,gridSurface,fanCap,orientTowards,planarUV,slab,loft,paintVertices,auxVertices,triangleCount};
})();
NS.HullLines=(()=>{
const {Vector3} = ENG;

// Lines plan of an ~8.2 m Downeast lobster boat, in the boat's local frame:
// +Z forward (bow), +Y up, +X port. y = 0 is the design waterline, x = 0 the
// centerline and z = 0 the middle of the waterline.
//
// The hull surface is parameterized by t (0 = transom .. 1 = stem head) and a
// section index j running from the keel (j = 0) up to the sheer. Each section
// is a centripetal Catmull-Rom spline through seven control points (keel,
// garboard, bilge start, bilge, bilge end, topsides, sheer). Aft sections are
// planar (constant z); forward of t = 0.55 they tilt progressively so that the
// last one (t = 1) traces the raked stem with a rounded forefoot.

const clamp01 = ( x ) => Math.min( 1, Math.max( 0, x ) );
const lerp = ( a, b, t ) => a + ( b - a ) * t;
const sstep = ( a, b, x ) => {

	const t = clamp01( ( x - a ) / ( b - a ) );
	return t * t * ( 3 - 2 * t );

};

// Intervals per spline span (K-G, G-B1, B1-C, C-B2, B2-M, M-S) at density 1.
const SPANS = [ 4, 4, 3, 3, 8, 10 ];

const RHO_SEAWATER = 1025;

class HullLines {

	constructor() {

		this.zAft = - 3.9;
		this.zBow = 4.3;
		this.length = this.zBow - this.zAft;

		this.deckY = 0.35; // cockpit sole
		this.shell = 0.07; // outer skin to inner lining at the sheer
		this.houseBack = - 0.35; // aft end of the wheelhouse side walls
		this.houseFront = 1.45; // wheelhouse front (base of the windshield)

		// Stem: straight rake above the forefoot, circular forefoot below.
		const k = 0.2, R = 0.45;
		const yF = this.keelY( 1 ), yTip = this.sheerY( 1 );
		const zW = this.zBow - k * yTip;
		const q = Math.sqrt( 1 + k * k );
		const yc = yF + R;
		this.stem = { k, R, yF, zW, yc, zc: zW + k * yc - R * q, yT: yc - R * k / q };

		this._setback = new Map();
		this._sectionCache = new Map();

		this.analyze();

	}

	// ---------------------------------------------------------------- design curves

	sheerZ( t ) {

		return this.zAft + this.length * t;

	}

	tAtSheerZ( z ) {

		return clamp01( ( z - this.zAft ) / this.length );

	}

	sheerY( t ) {

		const a = Math.max( 0, 1 - t / 0.2 );
		return 0.98 + 0.62 * Math.pow( t, 2.2 ) + 0.04 * a * a;

	}

	sheerX( t ) {

		if ( t <= 0.42 ) {

			const a = 1 - t / 0.42;
			return 1.45 - 0.17 * a * a;

		}

		const s = ( t - 0.42 ) / 0.58;
		return 1.45 * ( 1 - Math.pow( s, 2.6 ) );

	}

	keelY( t ) {

		if ( t <= 0.45 ) return - 0.23 - 0.22 * Math.sin( Math.PI * 0.5 * t / 0.45 );
		return - 0.45 + 0.33 * Math.pow( sstep( 0.45, 1, t ), 1.6 );

	}

	chineX( t ) {

		if ( t <= 0.42 ) {

			const a = 1 - t / 0.42;
			return 1.26 - 0.1 * a * a;

		}

		const s = ( t - 0.42 ) / 0.58;
		return 1.26 * Math.pow( Math.max( 0, 1 - Math.pow( s, 1.7 ) ), 1.15 );

	}

	chineY( t ) {

		return lerp( 0.01, - 0.045, sstep( 0, 0.45, t ) ) + 0.33 * Math.pow( sstep( 0.5, 1, t ), 1.3 );

	}

	bilgeTangent( t ) {

		return lerp( 0.2, 0.24, sstep( 0, 0.4, t ) ) * ( 1 - 0.55 * sstep( 0.6, 1, t ) );

	}

	bottomConvexity( t ) {

		return lerp( 0.025, 0.012, sstep( 0.55, 0.95, t ) );

	}

	flare( t ) {

		return lerp( - 0.012, 0.075, sstep( 0.3, 0.85, t ) ) * ( 1 - 0.3 * sstep( 0.9, 1, t ) );

	}

	bowBlend( t ) {

		return t > 0.55 ? ( ( t - 0.55 ) / 0.45 ) ** 2 : 0;

	}

	stemZ( y ) {

		const s = this.stem;
		if ( y >= s.yT ) return s.zW + s.k * y;
		const dy = y - s.yc;
		return s.zc + Math.sqrt( Math.max( 0, s.R * s.R - dy * dy ) );

	}

	// ---------------------------------------------------------------- sections

	controlPoints( t ) {

		const K = [ 0, this.keelY( t ) ];
		const C0 = [ this.chineX( t ), this.chineY( t ) ];
		const S = [ this.sheerX( t ), this.sheerY( t ) ];

		const bx = C0[ 0 ] - K[ 0 ], by = C0[ 1 ] - K[ 1 ];
		const lb = Math.hypot( bx, by );
		const dbx = bx / lb, dby = by / lb;
		const tx = S[ 0 ] - C0[ 0 ], ty = S[ 1 ] - C0[ 1 ];
		const lt = Math.hypot( tx, ty );
		const dtx = tx / lt, dty = ty / lt;

		// shape offsets fade out where the section collapses into the stem
		const w = sstep( 0, 0.3, C0[ 0 ] );
		const r = Math.min( this.bilgeTangent( t ), 0.3 * lb, 0.3 * lt );

		const convex = this.bottomConvexity( t ) * lb * w;
		const G = [ K[ 0 ] + dbx * lb * 0.5 + dby * convex, K[ 1 ] + dby * lb * 0.5 - dbx * convex ];
		const B1 = [ C0[ 0 ] - dbx * r, C0[ 1 ] - dby * r ];
		const B2 = [ C0[ 0 ] + dtx * r, C0[ 1 ] + dty * r ];

		// midpoint of a circular fillet between bottom and topsides lines
		const psi = Math.acos( Math.min( 1, Math.max( - 1, dbx * dtx + dby * dty ) ) );
		const mx = dtx - dbx, my = dty - dby;
		const ml = Math.hypot( mx, my );
		const e = ml > 1e-6 ? r * Math.tan( psi / 4 ) / ml : 0;
		const Cm = [ C0[ 0 ] + mx * e, C0[ 1 ] + my * e ];

		const fl = this.flare( t ) * lt * w; // > 0: concave flare
		const M = [ C0[ 0 ] + dtx * lt * 0.5 - dty * fl, C0[ 1 ] + dty * lt * 0.5 + dtx * fl ];

		return [ K, G, B1, Cm, B2, M, S ];

	}

	// Section points (x >= 0, y) from keel to sheer as a flat [x0, y0, x1, y1, ...] array.
	sectionPoints( t, density = 1 ) {

		const key = t + ':' + density;
		const cached = this._sectionCache.get( key );
		if ( cached ) return cached;

		const cp = this.controlPoints( t );
		const n = cp.length;
		const ext = [
			[ 2 * cp[ 0 ][ 0 ] - cp[ 1 ][ 0 ], 2 * cp[ 0 ][ 1 ] - cp[ 1 ][ 1 ] ],
			...cp,
			[ 2 * cp[ n - 1 ][ 0 ] - cp[ n - 2 ][ 0 ], 2 * cp[ n - 1 ][ 1 ] - cp[ n - 2 ][ 1 ] ],
		];

		const count = SPANS.reduce( ( a, b ) => a + b, 0 ) * density + 1;
		const out = new Float64Array( count * 2 );
		let k = 0;
		const p = [ 0, 0 ];
		for ( let s = 0; s < SPANS.length; s ++ ) {

			const steps = SPANS[ s ] * density;
			for ( let i = 0; i < steps; i ++ ) {

				catmullRom( ext[ s ], ext[ s + 1 ], ext[ s + 2 ], ext[ s + 3 ], i / steps, p );
				out[ k ++ ] = Math.max( 0, p[ 0 ] );
				out[ k ++ ] = p[ 1 ];

			}

		}

		out[ k ++ ] = cp[ n - 1 ][ 0 ];
		out[ k ++ ] = cp[ n - 1 ][ 1 ];

		if ( this._sectionCache.size > 4096 ) this._sectionCache.clear();
		this._sectionCache.set( key, out );
		return out;

	}

	// Longitudinal setback of each section point, so the t = 1 section traces the stem.
	setback( density = 1 ) {

		let H = this._setback.get( density );
		if ( H ) return H;
		const sec = this.sectionPoints( 1, density );
		const n = sec.length / 2;
		H = new Float64Array( n );
		for ( let j = 0; j < n; j ++ ) H[ j ] = this.zBow - this.stemZ( sec[ 2 * j + 1 ] );
		H[ n - 1 ] = 0;
		this._setback.set( density, H );
		return H;

	}

	sectionCount( density = 1 ) {

		return SPANS.reduce( ( a, b ) => a + b, 0 ) * density + 1;

	}

	// Surface points of station t as Vector3s (port side).
	station( t, density = 1 ) {

		const sec = this.sectionPoints( t, density );
		const H = this.setback( density );
		const zs = this.sheerZ( t ), D = this.bowBlend( t );
		const pts = [];
		for ( let j = 0; j < H.length; j ++ ) pts.push( new Vector3( sec[ 2 * j ], sec[ 2 * j + 1 ], zs - D * H[ j ] ) );
		return pts;

	}

	// Station parameters, denser toward the bow where the sections change quickly.
	stationParams( count ) {

		const density = ( t ) => 1 + 2.2 * sstep( 0.62, 1, t ) + 0.5 * ( 1 - sstep( 0, 0.08, t ) );
		const N = 2000;
		const cum = new Float64Array( N + 1 );
		for ( let i = 1; i <= N; i ++ ) cum[ i ] = cum[ i - 1 ] + density( ( i - 0.5 ) / N ) / N;
		const total = cum[ N ];
		const ts = [];
		let k = 0;
		for ( let i = 0; i < count; i ++ ) {

			const target = total * i / ( count - 1 );
			while ( k < N && cum[ k + 1 ] < target ) k ++;
			const f = ( target - cum[ k ] ) / Math.max( 1e-12, cum[ k + 1 ] - cum[ k ] );
			ts.push( i === count - 1 ? 1 : ( k + clamp01( f ) ) / N );

		}

		return ts;

	}

	// Outer half-breadth of the station t at height y (topsides, above the bilge).
	halfBreadth( t, y ) {

		const sec = this.sectionPoints( t, 2 );
		const n = sec.length / 2;
		if ( y >= sec[ 2 * n - 1 ] ) return sec[ 2 * n - 2 ];
		for ( let j = n - 2; j >= 0; j -- ) {

			const y0 = sec[ 2 * j + 1 ], y1 = sec[ 2 * j + 3 ];
			if ( y >= y0 && y <= y1 ) {

				const f = ( y - y0 ) / Math.max( 1e-9, y1 - y0 );
				return lerp( sec[ 2 * j ], sec[ 2 * j + 2 ], f );

			}

		}

		return 0;

	}

	// Station parameter whose surface passes through longitudinal position z at height y.
	tAt( z, y ) {

		let lo = 0, hi = 1;
		for ( let i = 0; i < 40; i ++ ) {

			const mid = ( lo + hi ) * 0.5;
			if ( this.zOnStation( mid, y ) < z ) lo = mid; else hi = mid;

		}

		return ( lo + hi ) * 0.5;

	}

	// Longitudinal position of station t at height y (accounts for the tilted bow sections).
	zOnStation( t, y ) {

		const D = this.bowBlend( t );
		if ( D === 0 ) return this.sheerZ( t );
		const sec = this.sectionPoints( t, 2 );
		const H = this.setback( 2 );
		const n = sec.length / 2;
		let h = 0;
		if ( y <= sec[ 1 ] ) h = H[ 0 ];
		else if ( y >= sec[ 2 * n - 1 ] ) h = 0;
		else {

			for ( let j = 0; j < n - 1; j ++ ) {

				const y0 = sec[ 2 * j + 1 ], y1 = sec[ 2 * j + 3 ];
				if ( y >= y0 && y <= y1 ) {

					h = lerp( H[ j ], H[ j + 1 ], ( y - y0 ) / Math.max( 1e-9, y1 - y0 ) );
					break;

				}

			}

		}

		return this.sheerZ( t ) - D * h;

	}

	// Outer hull half-breadth at an arbitrary (z, y) on the topsides.
	hullXAt( z, y ) {

		return this.halfBreadth( this.tAt( z, y ), y );

	}

	// ---------------------------------------------------------------- hydrostatics

	analyze() {

		const density = 3;
		const NT = 480;
		const H = this.setback( density );
		const nj = H.length;

		// Waterline (y = 0 crossing of every station).
		const wl = [];
		for ( let i = 0; i <= NT; i ++ ) {

			const t = i / NT;
			const sec = this.sectionPoints( t, density );
			const zs = this.sheerZ( t ), D = this.bowBlend( t );
			for ( let j = 0; j < nj - 1; j ++ ) {

				const y0 = sec[ 2 * j + 1 ], y1 = sec[ 2 * j + 3 ];
				if ( y0 <= 0 && y1 > 0 ) {

					const f = - y0 / ( y1 - y0 );
					wl.push( [ zs - D * lerp( H[ j ], H[ j + 1 ], f ), lerp( sec[ 2 * j ], sec[ 2 * j + 2 ], f ) ] );
					break;

				}

			}

		}

		wl.sort( ( a, b ) => a[ 0 ] - b[ 0 ] );
		this.wlStart = wl[ 0 ][ 0 ];
		this.wlEnd = wl[ wl.length - 1 ][ 0 ];

		const TN = 512;
		this._beamTable = new Float64Array( TN + 1 );
		this._tableZ0 = this.wlStart;
		this._tableDz = ( this.wlEnd - this.wlStart ) / TN;
		let k = 0;
		for ( let i = 0; i <= TN; i ++ ) {

			const z = this.wlStart + i * this._tableDz;
			while ( k < wl.length - 2 && wl[ k + 1 ][ 0 ] < z ) k ++;
			const a = wl[ k ], b = wl[ k + 1 ];
			const f = clamp01( ( z - a[ 0 ] ) / Math.max( 1e-9, b[ 0 ] - a[ 0 ] ) );
			this._beamTable[ i ] = lerp( a[ 1 ], b[ 1 ], f );

		}

		// Rasterize the immersed canoe body (port half) into a bottom height field.
		const cell = 0.02;
		const x0 = 0, z0 = this.zAft - 0.02;
		const nx = Math.ceil( 1.5 / cell ), nz = Math.ceil( ( this.wlEnd + 0.05 - z0 ) / cell );
		const bottom = new Float32Array( nx * nz ).fill( Infinity );
		const grid = [];
		for ( let i = 0; i <= NT; i ++ ) {

			const t = i / NT;
			const sec = this.sectionPoints( t, density );
			const zs = this.sheerZ( t ), D = this.bowBlend( t );
			const row = new Float64Array( nj * 3 );
			for ( let j = 0; j < nj; j ++ ) {

				row[ 3 * j ] = sec[ 2 * j ];
				row[ 3 * j + 1 ] = sec[ 2 * j + 1 ];
				row[ 3 * j + 2 ] = zs - D * H[ j ];

			}

			grid.push( row );

		}

		const tri = ( a, b, c ) => {

			// a, b, c: [x, y, z]
			if ( Math.min( a[ 1 ], b[ 1 ], c[ 1 ] ) > 0.01 ) return;
			const minX = Math.min( a[ 0 ], b[ 0 ], c[ 0 ] ), maxX = Math.max( a[ 0 ], b[ 0 ], c[ 0 ] );
			const minZ = Math.min( a[ 2 ], b[ 2 ], c[ 2 ] ), maxZ = Math.max( a[ 2 ], b[ 2 ], c[ 2 ] );
			const i0 = Math.max( 0, Math.ceil( ( minX - x0 ) / cell - 0.5 ) ), i1 = Math.min( nx - 1, Math.floor( ( maxX - x0 ) / cell - 0.5 ) );
			const k0 = Math.max( 0, Math.ceil( ( minZ - z0 ) / cell - 0.5 ) ), k1 = Math.min( nz - 1, Math.floor( ( maxZ - z0 ) / cell - 0.5 ) );
			if ( i0 > i1 || k0 > k1 ) return;
			const det = ( b[ 2 ] - c[ 2 ] ) * ( a[ 0 ] - c[ 0 ] ) + ( c[ 0 ] - b[ 0 ] ) * ( a[ 2 ] - c[ 2 ] );
