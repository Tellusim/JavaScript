// MIT License
// 
// Copyright (C) 2018-2024, Tellusim Technologies Inc. https://tellusim.com/
// 
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// 
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
// 
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

/*
 */
var Module = {
	preRun: () => {
		Module.FS.createPreloadedFile('/', 'main.shader', 'main.shader', true, false);
		Module.FS.createPreloadedFile('/', 'skinned.glb', 'skinned.glb', true, false);
		Module.FS.createPreloadedFile('/', 'skinned_body.jpg', 'skinned_body.jpg', true, false);
		Module.FS.createPreloadedFile('/', 'skinned_head.jpg', 'skinned_head.jpg', true, false);
	},
};

/*
 */
Tellusim(Module).then(ts => {
	ts.run(main);
});

/*
 */
function main(ts, app) {
	
	// create window
	let window = new ts.Window(app.platform, app.device);
	if(!window.isValidPtr()) return;
	
	window.setSize(app.width, app.height);
	window.setCloseClickedCallback(function() {
		window.stop();
	});
	window.setKeyboardPressedCallback(function(key, code) {
		if(key == ts.Window.Key.Esc) window.stop();
	});
	
	let title = window.platform_name + ' Tellusim::Skinned';
	if(!window.create(title, ts.Window.Flags.DefaultFlags) || !window.setHidden(false)) return;
	
	// create device
	let device = new ts.Device(window);
	if(!device.isValidPtr()) return;
	
	// create pipeline
	let pipeline = device.createPipeline();
	pipeline.setSamplerMask(0, ts.Shader.Mask.Fragment);
	pipeline.setTextureMask(0, ts.Shader.Mask.Fragment);
	pipeline.setUniformMasks(0, 2, ts.Shader.Mask.Vertex);
	pipeline.addAttribute(ts.Pipeline.Attribute.Position, ts.Format.RGBf32, 0, 0, 32);
	pipeline.addAttribute(ts.Pipeline.Attribute.Normal, ts.Format.RGBf32, 0, 12, 32);
	pipeline.addAttribute(ts.Pipeline.Attribute.TexCoord, ts.Format.RGf32, 0, 24, 32);
	pipeline.addAttribute(ts.Pipeline.Attribute.Weights, ts.Format.RGBAf32, 1, 0, 32);
	pipeline.addAttribute(ts.Pipeline.Attribute.Joints, ts.Format.RGBAu32, 1, 16, 32);
	pipeline.setColorFormat(window.color_format);
	pipeline.setDepthFormat(window.depth_format);
	pipeline.setDepthFunc(ts.Pipeline.DepthFunc.LessEqual);
	if(!pipeline.loadShaderGLSL(ts.Shader.Type.Vertex, 'main.shader', 'VERTEX_SHADER=1')) return;
	if(!pipeline.loadShaderGLSL(ts.Shader.Type.Fragment, 'main.shader', 'FRAGMENT_SHADER=1')) return;
	if(!pipeline.create()) return;
	
	// create sampler
	let sampler = device.createSampler(ts.Sampler.Filter.Trilinear, ts.Sampler.WrapMode.Repeat);
	if(!sampler.isValidPtr()) return;
	
	// create textures
	let textures = [
		device.loadTexture('skinned_head.jpg'),
		device.loadTexture('skinned_body.jpg'),
	];
	if(!textures[0].isValidPtr() || !textures[1].isValidPtr()) return;
	
	// load mesh
	let mesh = new ts.Mesh();
	if(!mesh.load('skinned.glb')) return;
	if(!mesh.getNumAnimations()) return;
	mesh.setBasis(ts.Mesh.Basis.ZUpRight);
	
	// create model
	let model = new ts.MeshModel();
	if(!model.create(device, pipeline, mesh)) return;
	
	// create target
	let target = device.createTarget(window);
	if(!target.isValidPtr()) return;
	
	////////////////////////////////
	// main loop
	////////////////////////////////
	
	window.run(function() {
		
		// update window
		ts.Window.update(false);
		
		// render window
		if(!window.render()) return false;
		
		// window target
		target.setClearColor(0.2, 0.2, 0.2, 1.0);
		target.begin();
		{
			let command = device.createCommand(target);
			
			// set pipeline
			command.setPipeline(pipeline);
			
			// set sampler
			command.setSampler(0, sampler);
			
			// set model buffers
			model.setBuffers(command);
			
			// set common parameters
			let camera = new ts.Vector3f(-80.0, 0.0, 70.0);
			let projection = ts.Matrix4x4f.perspective(60.0, window.width / window.height, 0.1, 1000.0);
			let modelview = ts.Matrix4x4f.lookAt(camera, new ts.Vector3f(0.0, 0.0, 40.0), new ts.Vector3f(0.0, 0.0, 1.0));
			if(target.isFlipped()) projection = ts.Matrix4x4f.scale(1.0, -1.0, 1.0).mul(projection);
			
			let common_parameters_buffer = new ArrayBuffer(256);
			let common_parameters = new Float32Array(common_parameters_buffer);
			common_parameters.set(projection.getArray());
			common_parameters.set(modelview.getArray(), 16);
			common_parameters.set(camera.getArray(), 32);
			command.setUniform(0, common_parameters);
			
			// mesh animation
			let time = ts.Time.seconds();
			let animation = mesh.getAnimation(0);
			animation.setTime(time * 0.7, ts.Matrix4x3d.rotateZ(180.0 + Math.sin(time * 0.5) * 40.0));
			
			// draw geometries
			let joint_parameters_buffer = new ArrayBuffer(192 * 16);
			let joint_parameters = new Float32Array(joint_parameters_buffer);
			for(let i = 0; i < mesh.getNumGeometries(); i++) {
				let geometry = mesh.getGeometry(i);
				
				// joint transforms
				for(let j = 0; j < geometry.getNumJoints(); j++) {
					let joint = geometry.getJoint(j);
					let transform = new ts.Matrix4x3f(animation.getGlobalTransform(joint)).mul(joint.getITransform()).mul(geometry.getTransform());
					joint_parameters.set(transform.getArray(), j * 12);
				}
				command.setUniform(1, joint_parameters);
				
				// draw materials
				for(let j = 0; j < geometry.getNumMaterials(); j++) {
					command.setTexture(0, textures[j]);
					model.draw(command, geometry.getIndex(), j);
				}
			}
			
			// destroy pointer
			command.destroyPtr();
		}
		target.end();
		
		// present window
		if(!window.present()) return false;
		
		// check device
		if(!device.check()) return false;
		
		return true;
	});
	
	// finish context
	window.finish();
	
	// done
	ts.Log.print(ts.Log.Level.Message, "Done\n");
}
