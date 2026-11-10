<script>

    import { onMount, onDestroy } from 'svelte';
    import { mount, destroy } from './WebGPURenderAudio';

    let canvas;

    let data = {
    };

    onMount(() => {
        mount(canvas, data);
    });

    onDestroy(() => {
        destroy();
    });

</script>

<canvas bind:this={canvas} width="512" height="512" />
