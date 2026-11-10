<script>

    import { onMount, onDestroy } from 'svelte';
    import { mount, destroy } from './WebGPUTest0';

    let canvas;

    let data = {
        rez: 512,
    };

    onMount(() => {
        mount(canvas, data);
    });

    onDestroy(() => {
        destroy();
    });

</script>
  
<canvas bind:this={canvas} width="512" height="512" />
