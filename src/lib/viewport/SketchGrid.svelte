<script lang="ts">
  import { T } from '@threlte/core';
  import * as THREE from 'three';

  interface Props {
    basis: {
      origin: THREE.Vector3;
      x: THREE.Vector3;
      y: THREE.Vector3;
      z: THREE.Vector3;
    };
    size?: number;
    divisions?: number;
  }

  let { basis, size = 200, divisions = 200 } : Props = $props();

  // Obliczamy rotację siatki, aby leżała na płaszczyźnie szkicu
  // Standardowy GridHelper leży w płaszczyźnie XZ. 
  // Musimy go obrócić tak, aby jego "góra" (oś Y) pokrywała się z normalną płaszczyzny (basis.z)
  
  let gridRotation = $derived.by(() => {
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0); // Domyślna góra GridHelpera
    quaternion.setFromUnitVectors(up, basis.z);
    return new THREE.Euler().setFromQuaternion(quaternion);
  });

  // Kolory siatki
  const mainColor = '#475569'; // Ciemniejszy dla głównych linii
  const sectionColor = '#1e293b'; // Tło
</script>

<T.Group 
  position={[basis.origin.x, basis.origin.y, basis.origin.z]}
  rotation={[gridRotation.x, gridRotation.y, gridRotation.z]}
>
  <T.GridHelper 
    args={[size, divisions, '#334155', '#334155']} 
    transparent
    opacity={0.4}
  />
  
  <T.GridHelper 
    args={[size, size / 10, '#64748b', '#64748b']} 
    transparent
    opacity={0.2}
  />
</T.Group>