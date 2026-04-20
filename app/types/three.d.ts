declare module 'three' {
  export class Color {
    r: number
    g: number
    b: number
    constructor(value?: string | number)
    clone(): Color
    multiplyScalar(value: number): Color
  }

  export class Vector2 {
    x: number
    y: number
    constructor(x?: number, y?: number)
  }

  export class Vector3 {
    x: number
    y: number
    z: number
    set(x: number, y: number, z: number): void
    setScalar(value: number): void
  }

  export class Object3D {
    children: Object3D[]
    position: Vector3
    scale: Vector3
    userData: Record<string, unknown>
    add(...objects: Object3D[]): void
    traverse(callback: (child: Object3D) => void): void
  }

  export class Scene extends Object3D {
    background: Color | null
    fog: Fog | null
    remove(object: Object3D): void
  }

  export class Fog {
    constructor(color: string | number, near: number, far: number)
  }

  export class PerspectiveCamera extends Object3D {
    aspect: number
    constructor(fov: number, aspect: number, near: number, far: number)
    updateProjectionMatrix(): void
  }

  export class BufferAttribute {
    constructor(array: Float32Array, itemSize: number)
  }

  export class BufferGeometry {
    dispose(): void
    setAttribute(name: string, attribute: BufferAttribute): void
  }

  export class IcosahedronGeometry extends BufferGeometry {
    constructor(radius?: number, detail?: number)
  }

  export class BoxGeometry extends BufferGeometry {
    constructor(width?: number, height?: number, depth?: number)
  }

  export class ConeGeometry extends BufferGeometry {
    constructor(radius?: number, height?: number, radialSegments?: number)
  }

  export class OctahedronGeometry extends BufferGeometry {
    constructor(radius?: number, detail?: number)
  }

  export class SphereGeometry extends BufferGeometry {
    constructor(radius?: number, widthSegments?: number, heightSegments?: number)
  }

  export class Material {
    dispose(): void
  }

  export class PointsMaterial extends Material {
    constructor(options?: Record<string, unknown>)
  }

  export class MeshStandardMaterial extends Material {
    constructor(options?: Record<string, unknown>)
  }

  export class Mesh extends Object3D {
    geometry: BufferGeometry
    material: Material | Material[]
    constructor(geometry: BufferGeometry, material: Material | Material[])
  }

  export class Group extends Object3D {}

  export class Points extends Object3D {
    constructor(geometry: BufferGeometry, material: Material)
  }

  export class AmbientLight extends Object3D {
    constructor(color?: string | number, intensity?: number)
  }

  export class DirectionalLight extends Object3D {
    constructor(color?: string | number, intensity?: number)
  }

  export interface Intersection {
    object: Object3D
    index?: number
  }

  export class Raycaster {
    setFromCamera(pointer: Vector2, camera: PerspectiveCamera): void
    intersectObjects(objects: Object3D[], recursive?: boolean): Intersection[]
  }

  export class WebGLRenderer {
    domElement: HTMLCanvasElement
    constructor(options?: Record<string, unknown>)
    setPixelRatio(value: number): void
    setSize(width: number, height: number, updateStyle?: boolean): void
    render(scene: Scene, camera: PerspectiveCamera): void
    dispose(): void
  }
}

declare module 'three/examples/jsm/controls/OrbitControls.js' {
  import type { PerspectiveCamera } from 'three'

  export class OrbitControls {
    enableDamping: boolean
    dampingFactor: number
    minDistance: number
    maxDistance: number
    constructor(camera: PerspectiveCamera, domElement: HTMLElement)
    update(): void
    dispose(): void
  }
}
