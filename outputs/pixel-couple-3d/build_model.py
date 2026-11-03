"""Build two colorful voxel figures from the supplied pixel-art reference.

Run: python3 build_model.py
Requires: Pillow, NumPy, SciPy, trimesh.
"""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import binary_fill_holes, distance_transform_edt, label
import trimesh


HERE = Path(__file__).resolve().parent
REFERENCE = HERE / "reference.png"
STEP = 6  # source image pixels per model voxel
WORLD_SCALE = 0.060


def sample_reference():
    source = np.asarray(Image.open(REFERENCE).convert("RGB"))
    crop = source[387:902, 345:900]
    h = (crop.shape[0] + STEP - 1) // STEP
    w = (crop.shape[1] + STEP - 1) // STEP
    colors = np.zeros((h, w, 3), dtype=np.uint8)
    mask = np.zeros((h, w), dtype=bool)
    for j in range(h):
        for i in range(w):
            block = crop[j * STEP:(j + 1) * STEP, i * STEP:(i + 1) * STEP]
            foreground = block.min(axis=2) < 245
            if foreground.mean() > 0.18:
                colors[j, i] = np.median(block[foreground], axis=0)
                mask[j, i] = True

    # Keep the connected character shapes and preserve white eye highlights.
    for a, b in ((0, 49), (49, w)):
        component, count = label(mask[:, a:b])
        if count:
            sizes = np.bincount(component.ravel())
            keep = sizes[1:].argmax() + 1
            mask[:, a:b] = binary_fill_holes(component == keep)

    # Pale antialias pixels at the outer hair edge turn into bright streaks
    # when extruded. Replace only those boundary colors with nearby hair.
    distance = distance_transform_edt(mask)
    for j, i in np.argwhere(mask & (distance <= 1.42)):
        if j >= 70:
            continue
        rgb = colors[j, i]
        pale_cutoff = 75 if j < 45 else 155
        if int(rgb.max()) < pale_cutoff or int(rgb.max()) - int(rgb.min()) >= 50:
            continue
        neighbors = []
        for nj in range(max(0, j - 2), min(h, j + 3)):
            for ni in range(max(0, i - 2), min(w, i + 3)):
                if mask[nj, ni] and distance[nj, ni] > distance[j, i] and colors[nj, ni].max() < 145:
                    neighbors.append((distance[nj, ni], colors[nj, ni].copy()))
        if neighbors:
            colors[j, i] = max(neighbors, key=lambda item: item[0])[1]
    return colors, mask


def voxel_depth(i, j, rgb, boundary_distance):
    r, g, b = map(int, rgb)
    # Face, hair, clothing, and shoes have different volumes.
    if j < 47:
        skin = r > 125 and g > 65 and r > g * 1.18 and b < 180
        base = 7.2 if skin else 8.8
    elif j < 68:
        skin = r > 125 and g > 65 and r > g * 1.18 and b < 180
        hair = i >= 49 and r > g * 1.28 and j < 64
        base = 5.0 if skin else (7.5 if hair else 5.8)
    elif j < 77:
        base = 5.4
    else:
        base = 5.8
    return base + min(boundary_distance / 7.0, 1.0) * 0.8


def back_color(i, j, rgb):
    r, g, b = map(int, rgb)
    if j < 46:
        return (75, 42, 35, 255) if i < 49 else (62, 38, 34, 255)
    if j < 68:
        skin = r > 125 and g > 65 and r > g * 1.18 and b < 180
        if skin:
            return (201, 119, 77, 255)
        if i >= 49 and r > g * 1.28 and j < 65:
            return (65, 40, 35, 255)
        return (38, 34, 39, 255)
    if j < 78:
        return (154, 147, 136, 255) if i < 49 else (65, 97, 121, 255)
    return (180, 190, 202, 255)


def shade(rgb, factor):
    return tuple(int(max(0, min(255, x * factor))) for x in rgb[:3]) + (255,)


def build_figure(colors, mask, left, right):
    h, w = mask.shape
    region = mask[:, left:right]
    distance = distance_transform_edt(region)
    depths = np.zeros((h, w), dtype=float)
    for j, i_local in np.argwhere(region):
        i = i_local + left
        depths[j, i] = voxel_depth(i, j, colors[j, i], distance[j, i_local])

    vertices = []
    vertex_colors = []
    triangles = []

    def quad(corners, rgba):
        offset = len(vertices)
        vertices.extend(corners)
        vertex_colors.extend([rgba] * 4)
        triangles.extend([(offset, offset + 1, offset + 2),
                          (offset, offset + 2, offset + 3)])

    for j, i_local in np.argwhere(region):
        i = i_local + left
        d = depths[j, i]
        x0, x1 = i - w / 2, i + 1 - w / 2
        y0, y1 = h - j - 1, h - j
        front = tuple(map(int, colors[j, i])) + (255,)
        rear = back_color(i, j, colors[j, i])
        quad([(x0, y0, d), (x1, y0, d), (x1, y1, d), (x0, y1, d)], front)
        quad([(x1, y0, -d), (x0, y0, -d), (x0, y1, -d), (x1, y1, -d)], rear)

        # Exposed steps join adjacent columns into one closed solid.
        for di, dj, side_light in ((-1, 0, 0.73), (1, 0, 0.83),
                                   (0, -1, 1.04), (0, 1, 0.60)):
            ni, nj = i + di, j + dj
            neighbor = depths[nj, ni] if 0 <= ni < w and 0 <= nj < h else 0
            if neighbor >= d:
                continue
            if di == -1:
                edge = lambda za, zb: [(x0, y0, za), (x0, y1, za),
                                        (x0, y1, zb), (x0, y0, zb)]
            elif di == 1:
                edge = lambda za, zb: [(x1, y1, za), (x1, y0, za),
                                        (x1, y0, zb), (x1, y1, zb)]
            elif dj == -1:
                edge = lambda za, zb: [(x0, y1, za), (x1, y1, za),
                                        (x1, y1, zb), (x0, y1, zb)]
            else:
                edge = lambda za, zb: [(x1, y0, za), (x0, y0, za),
                                        (x0, y0, zb), (x1, y0, zb)]
            quad(edge(d, neighbor), shade(front, side_light))
            quad(edge(-neighbor, -d), shade(rear, side_light * 0.85))

    mesh = trimesh.Trimesh(vertices=np.asarray(vertices) * WORLD_SCALE,
                           faces=np.asarray(triangles),
                           vertex_colors=np.asarray(vertex_colors, dtype=np.uint8),
                           process=False)
    return mesh


def render_preview(scene, destination):
    # A simple orthographic renderer makes a shareable preview without a 3D app.
    width, height = 1200, 1100
    image = Image.new("RGB", (width, height), "#f5f1ed")
    draw = ImageDraw.Draw(image)
    theta, phi = np.radians(25), np.radians(12)
    c, s = np.cos(theta), np.sin(theta)
    cp, sp = np.cos(phi), np.sin(phi)
    size = 120
    faces = []
    for mesh in scene.geometry.values():
        v = mesh.vertices / WORLD_SCALE
        projected = np.column_stack((v[:, 0] * c - v[:, 2] * s,
                                     v[:, 1] * cp - (v[:, 0] * s + v[:, 2] * c) * sp))
        depth = v[:, 0] * s * cp + v[:, 2] * c * cp + v[:, 1] * sp
        for face in mesh.faces:
            points = tuple((width / 2 + projected[k, 0] * size / 10,
                            height - 53 - projected[k, 1] * size / 10) for k in face)
            color = tuple(map(int, mesh.visual.vertex_colors[face[0], :3]))
            faces.append((float(depth[face].mean()), points, color))
    for _, points, color in sorted(faces, key=lambda item: item[0]):
        draw.polygon(points, fill=color)
    image.save(destination)


def main():
    colors, mask = sample_reference()
    scene = trimesh.Scene()
    scene.add_geometry(build_figure(colors, mask, 0, 49), geom_name="Left character")
    scene.add_geometry(build_figure(colors, mask, 49, mask.shape[1]), geom_name="Right character")
    destination = HERE / "pixel_couple.glb"
    destination.write_bytes(scene.export(file_type="glb"))
    render_preview(scene, HERE / "angled_preview.png")
    print(f"Saved {destination} ({destination.stat().st_size / 1024 / 1024:.1f} MB)")
    print(f"Figures: {len(scene.geometry)}; voxels: {mask.sum()}; size: {scene.extents.round(2)}")


if __name__ == "__main__":
    main()
