/**
 * @author mrdoob / http://mrdoob.com/
 *
 * adapted for bluemap's purposes
 */

import {
    Matrix4,
    Object3D, Vector2,
    Vector3
} from "three";
import {dispatchEvent} from "./Utils";

class CSS2DObject extends Object3D {

    constructor(element) {
        super();

        this.element = document.createElement("div");
        let parent = element.parentNode;
        parent.replaceChild(this.element, element);
        this.element.appendChild(element);

        this.element.style.position = 'absolute';

        this.anchor = new Vector2();

        this.events = null;

        this.addEventListener('removed', function () {

            this.traverse(function (object) {

                if (object.element instanceof Element && object.element.parentNode !== null) {

                    object.element.parentNode.removeChild(object.element);

                }

            });

        });

        let lastClick = -1;
        let handleClick = event => {
            let doubleTap = false;

            let now = Date.now();
            if (now - lastClick < 500) {
                doubleTap = true;
            }

            lastClick = now;

            let data = {doubleTap: doubleTap};

            if (this.onClick({event: event, data: data})) {
                event.preventDefault();
                event.stopPropagation();
            } else {
                // fire event
                dispatchEvent(this.events, "bluemapMapInteraction", {
                    data: data,
                    object: this,
                });
            }
        }

        this.element.addEventListener("click", handleClick);
        this.element.addEventListener("touch", handleClick);
    }

}

//

var CSS2DRenderer = function (events = null) {

    var _this = this;

    var _width, _height;
    var _widthHalf, _heightHalf;

    var vector = new Vector3();
    var viewMatrix = new Matrix4();
    var viewProjectionMatrix = new Matrix4();

    var cache = {
        objects: new WeakMap()
    };

    var domElement = document.createElement( 'div' );
    domElement.style.overflow = 'hidden';

    this.domElement = domElement;

    this.events = events;

    this.getSize = function () {

        return {
            width: _width,
            height: _height
        };

    };

    this.setSize = function ( width, height ) {

        _width = width;
        _height = height;

        _widthHalf = _width / 2;
        _heightHalf = _height / 2;

        domElement.style.width = width + 'px';
        domElement.style.height = height + 'px';

    };

    var renderObject = function ( object, scene, camera, parentVisible, collected ) {

        if ( object instanceof CSS2DObject ) {

            var element = object.element;

            if ( parentVisible && object.visible ) {

                object.events = _this.events;

                object.onBeforeRender( _this, scene, camera );

                vector.setFromMatrixPosition( object.matrixWorld );
                vector.applyMatrix4( viewProjectionMatrix );

                var onScreen = ( vector.z >= - 1 && vector.z <= 1 && element.style.opacity !== "0" );
                var display = onScreen ? '' : 'none';

                // Only touch the DOM when a value actually changed. Writing the same
                // style every frame still forces the browser to recalculate styles,
                // which is the main cost when there are lots of (html) markers.
                if ( object._css2dDisplay !== display ) {

                    element.style.display = display;
                    object._css2dDisplay = display;

                }

                if ( onScreen ) {

                    var transform = 'translate(' + ( vector.x * _widthHalf + _widthHalf - object.anchor.x ) + 'px,' + ( - vector.y * _heightHalf + _heightHalf - object.anchor.y ) + 'px)';

                    if ( object._css2dTransform !== transform ) {

                        element.style.transform = transform;
                        object._css2dTransform = transform;

                    }

                }

                var objectData = cache.objects.get( object );
                if ( objectData === undefined ) {

                    objectData = {};
                    cache.objects.set( object, objectData );

                }
                objectData.distanceToCameraSquared = getDistanceToSquared( camera, object );

                if ( element.parentNode !== domElement ) {

                    domElement.appendChild( element );

                }

                object.onAfterRender( _this, scene, camera );

                collected.push( object );

            } else if ( object._css2dDisplay !== 'none' ) {

                // Toggled-off marker (or one inside a hidden marker-set): hide it once,
                // then skip projection / distance / z-ordering entirely - no per-frame work.
                element.style.display = 'none';
                object._css2dDisplay = 'none';

            }

        }

        for ( var i = 0, l = object.children.length; i < l; i ++ ) {

            renderObject( object.children[ i ], scene, camera, parentVisible && object.visible, collected );

        }

    };

    var getDistanceToSquared = function () {

        var a = new Vector3();
        var b = new Vector3();

        return function ( object1, object2 ) {

            a.setFromMatrixPosition( object1.matrixWorld );
            b.setFromMatrixPosition( object2.matrixWorld );

            return a.distanceToSquared( b );

        };

    }();

    var zOrder = function ( objects ) {

        objects.sort( function ( a, b ) {

            var distanceA = cache.objects.get( a ).distanceToCameraSquared;
            var distanceB = cache.objects.get( b ).distanceToCameraSquared;

            return distanceA - distanceB;

        } );

        var zMax = objects.length;

        for ( var i = 0, l = objects.length; i < l; i ++ ) {

            let o = objects[ i ];
            let zIndex = o.disableDepthTest ? zMax + 1 : zMax - i;

            if ( o._css2dZIndex !== zIndex ) {

                o.element.style.zIndex = zIndex;
                o._css2dZIndex = zIndex;

            }

        }

    };

    this.render = function ( scene, camera ) {

        if ( scene.matrixWorldAutoUpdate === true ) scene.updateMatrixWorld();
        if ( camera.parent === null ) camera.updateMatrixWorld();

        viewMatrix.copy( camera.matrixWorldInverse );
        viewProjectionMatrix.multiplyMatrices( camera.projectionMatrix, viewMatrix );

        // Collect the visible CSS2D-objects during the single render-traversal
        // instead of traversing the whole scene a second time just to z-order them.
        var collected = [];
        renderObject( scene, scene, camera, true, collected );
        zOrder( collected );

    };

};

export { CSS2DObject, CSS2DRenderer };